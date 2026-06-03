const fs = require('fs');
require('dotenv').config();
const config = require('./config');
const { fetchNews } = require('./src/crawler');
const { selectNews } = require('./src/selector');
const { generateCardContent } = require('./src/generator');
const { renderCardImages } = require('./src/renderer');

async function testLive() {
  console.log('[Test Live] --- Starting Live Economy News Selection & Visual Render ---');
  
  // Validate basic Groq key
  if (!config.groqApiKey) {
    console.error('[Test Live] Error: GROQ_API_KEY is not set in .env.');
    console.error('Please create a .env file and set GROQ_API_KEY first.');
    process.exit(1);
  }

  console.log('[Test Live] 1. Fetching today\'s news from RSS feed...');
  const newsList = await fetchNews(config.newsRssUrl);
  if (newsList.length === 0) {
    console.log('[Test Live] No articles found.');
    return;
  }
  console.log(`[Test Live] Successfully fetched ${newsList.length} articles.`);

  console.log('[Test Live] 2. Selecting the best article using Groq Llama...');
  const selectedNews = await selectNews(newsList);
  console.log(`[Test Live] Selected News: "${selectedNews.title}"`);
  console.log(`[Test Live] RSS Link: ${selectedNews.link}`);

  console.log('[Test Live] 3. Generating Instagram captions, templates & bubble dialogues...');
  const cardContent = await generateCardContent(selectedNews);
  console.log('[Test Live] Selected Theme:', cardContent.template_theme);
  console.log('[Test Live] Theme Color:', cardContent.theme_color);

  console.log('[Test Live] 4. Launching Playwright to render card images (840x840 illustrations)...');
  const tempFiles = await renderCardImages(cardContent);

  // Rename to live_*.png to keep them in workspace root
  const liveFiles = [];
  for (let i = 0; i < tempFiles.length; i++) {
    const oldPath = tempFiles[i];
    const newPath = `live_${i + 1}.png`;
    if (fs.existsSync(oldPath)) {
      if (fs.existsSync(newPath)) {
        fs.unlinkSync(newPath); // Remove old test outputs
      }
      fs.renameSync(oldPath, newPath);
      liveFiles.push(newPath);
    }
  }

  console.log('\n==================================================');
  console.log('🎉 LIVE NEWS CARD RENDER COMPLETED! 🎉');
  console.log('==================================================');
  console.log('Generated Images in Workspace Root (Ready to Post):');
  liveFiles.forEach(f => console.log(` - ${f}`));
  console.log('\nGenerated Instagram Caption (Copy to Clipboard):');
  console.log('--------------------------------------------------');
  console.log(cardContent.instagram_caption);
  console.log('--------------------------------------------------');
  console.log('\nNOTE: Running test-live.js does NOT push to Slack and does NOT update history.json.');
}

testLive().catch(err => {
  console.error('[Test Live] Critical failure during execution:', err);
});
