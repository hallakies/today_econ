const fs = require('fs');
const config = require('../config');
const { fetchNews, fetchOgImage, fetchArticleBody } = require('./crawler');
const { selectNews, saveHistoryEntry } = require('./selector');
const { generateCardContent } = require('./generator');
const { renderCardImages } = require('./renderer');
const { sendToSlack } = require('./slack');

// Helper to validate configuration variables
function validateConfig() {
  const missing = [];
  if (!config.groqApiKey) missing.push('GROQ_API_KEY');
  if (!config.slackBotToken) missing.push('SLACK_BOT_TOKEN');
  if (!config.slackChannelId) missing.push('SLACK_CHANNEL_ID');
  
  if (missing.length > 0) {
    console.error(`[Main] Missing required environment variables: ${missing.join(', ')}`);
    console.error('[Main] Please copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
}

// Helper to delete temporary image files
function cleanupTempFiles(files) {
  console.log('[Main] Cleaning up temporary image files...');
  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`[Main] Deleted local file: ${file}`);
      }
    } catch (error) {
      console.warn(`[Main] Failed to delete ${file}:`, error);
    }
  }
}

async function run() {
  validateConfig();
  console.log('[Main] --- Starting Today\'s Economy Card News Pipeline ---');
  let renderedFiles = [];

  try {
    // 1. Fetch latest news articles
    const newsList = await fetchNews(config.newsRssUrl);
    if (newsList.length === 0) {
      console.log('[Main] No new articles found. Exiting.');
      return;
    }

    // 2. Select the single most important and non-duplicate news article
    const selectedNews = await selectNews(newsList);
    console.log(`[Main] Selected news title: "${selectedNews.title}"`);

    // 2.5 Fetch full article body for deeper analysis
    console.log('[Main] Fetching full article body...');
    const fullText = await fetchArticleBody(selectedNews.link);
    selectedNews.fullText = fullText || selectedNews.summary; // Fallback to summary if fetch fails

    // Pausing 8 seconds to prevent Groq TPM rate limit issues
    console.log('[Main] Pausing for 8 seconds to reset Groq TPM window...');
    await new Promise(resolve => setTimeout(resolve, 8000));

    // 3. Generate card content (Title, fact bullet points, action points, caption, image_prompt)
    const cardContent = await generateCardContent(selectedNews);
    console.log('[Main] Content generated successfully.');

    // 4. Generate AI Background Image URL
    let aiImageUrl = null;
    if (cardContent.image_prompt) {
      aiImageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cardContent.image_prompt)}?width=1080&height=1920&nologo=true`;
      console.log(`[Main] Generated AI Image URL from prompt: ${aiImageUrl.substring(0, 80)}...`);
    } else {
      console.log('[Main] No image_prompt generated. Will use fallback background.');
    }

    // --- Quality Gate: Validate generated content ---
    const qualityWarnings = [];
    if (!cardContent.instagram_caption || cardContent.instagram_caption.trim().length < 30) {
      qualityWarnings.push('instagram_caption is empty or too short');
    }
    if (!cardContent.card1 || !cardContent.card1.title) {
      qualityWarnings.push('card1.title is missing');
    }
    if (!cardContent.card2 || !Array.isArray(cardContent.card2.bullets) || cardContent.card2.bullets.length < 3) {
      qualityWarnings.push(`card2.bullets has only ${cardContent.card2?.bullets?.length || 0} items (expected 3)`);
    }
    if (!cardContent.card3 || !Array.isArray(cardContent.card3.bullets) || cardContent.card3.bullets.length < 3) {
      qualityWarnings.push(`card3.bullets has only ${cardContent.card3?.bullets?.length || 0} items (expected 3)`);
    }
    if (qualityWarnings.length > 0) {
      console.warn('[Main] ⚠️ Quality Gate warnings:');
      qualityWarnings.forEach(w => console.warn(`  - ${w}`));
    } else {
      console.log('[Main] ✅ Quality Gate passed. All required fields present.');
    }

    // 5. Render HTML slides to PNG files (using news og:image as background)
    renderedFiles = await renderCardImages(cardContent, aiImageUrl);
    console.log(`[Main] Successfully rendered ${renderedFiles.length} slides.`);

    // 6. Send images and Instagram caption to Slack
    await sendToSlack(renderedFiles, cardContent.instagram_caption, selectedNews);
    console.log('[Main] News and images sent to Slack!');

    // 7. Save the news item title to history to prevent future duplicates
    saveHistoryEntry(selectedNews.title);
    console.log('[Main] Saved selected news title to history file.');

    // 8. Cleanup temp PNG files so they aren't committed to Git
    cleanupTempFiles(renderedFiles);

    console.log('[Main] --- Pipeline execution completed successfully! ---');
  } catch (error) {
    console.error('[Main] Critical error during pipeline execution:', error);
    if (renderedFiles.length > 0) {
      cleanupTempFiles(renderedFiles);
    }
    process.exit(1);
  }
}

// Run the script
run();
