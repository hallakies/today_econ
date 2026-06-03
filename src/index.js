const fs = require('fs');
const config = require('../config');
const { fetchNews } = require('./crawler');
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

  if (!config.hfToken) {
    console.warn('[Main] Warning: HF_TOKEN is not set. Image generation will fallback to Pollinations.ai.');
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

    // Pausing 5 seconds to prevent Groq TPM rate limit issues
    console.log('[Main] Pausing for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3. Generate card content (Title, fact bullet points, action points, prompts, caption)
    const cardContent = await generateCardContent(selectedNews);
    console.log('[Main] Content and prompts generated successfully.');

    // 4. Generate illustrations and render the HTML slides to PNG files
    renderedFiles = await renderCardImages(cardContent);
    console.log(`[Main] Successfully rendered ${renderedFiles.length} slides.`);

    // 5. Send images and Instagram caption to Slack
    await sendToSlack(renderedFiles, cardContent.instagram_caption);
    console.log('[Main] News and images sent to Slack!');

    // 6. Save the news item title to history to prevent future duplicates
    saveHistoryEntry(selectedNews.title);
    console.log('[Main] Saved selected news title to history file.');

    // 7. Cleanup temp PNG files so they aren't committed to Git
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
