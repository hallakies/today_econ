const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const config = require('../config');
const { buildThemeHtml } = require('./templates');

// Path to the mascot image asset
const MASCOT_PATH = path.join(__dirname, '..', 'assets', 'mascot.png');

/**
 * Loads the mascot image as a base64 string.
 * @returns {string} Base64 encoded mascot image, or empty string if not found.
 */
function loadMascotBase64() {
  try {
    if (fs.existsSync(MASCOT_PATH)) {
      const buffer = fs.readFileSync(MASCOT_PATH);
      console.log(`[Renderer] Loaded mascot image (${(buffer.length / 1024).toFixed(1)}KB).`);
      return buffer.toString('base64');
    }
  } catch (error) {
    console.warn('[Renderer] Could not load mascot image:', error.message);
  }
  return '';
}

/**
 * Downloads the news article's og:image for use as card background.
 * Falls back to curated Unsplash images if og:image is unavailable.
 * @param {string|null} ogImageUrl The og:image URL from the article.
 * @param {number} fallbackIndex Index for selecting a fallback image.
 * @returns {Promise<Buffer>} The image binary data.
 */
async function downloadNewsImage(ogImageUrl, fallbackIndex = 0) {
  // Try og:image first
  if (ogImageUrl) {
    try {
      console.log(`[Renderer] Downloading article og:image: ${ogImageUrl.substring(0, 80)}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(ogImageUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TodayEconBot/1.0)' },
      });
      clearTimeout(timeout);
      
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (buffer.length > 5000) {
          console.log(`[Renderer] Successfully downloaded og:image (${(buffer.length / 1024).toFixed(1)}KB).`);
          return buffer;
        }
        console.warn('[Renderer] og:image too small, falling back...');
      }
    } catch (error) {
      console.warn('[Renderer] Failed to download og:image:', error.message);
    }
  }

  // Fallback: curated dark/professional background images
  const fallbacks = [
    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1080&h=1920&fit=crop&q=80', // trading chart
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1080&h=1920&fit=crop&q=80', // dark architecture
    'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=1080&h=1920&fit=crop&q=80', // abstract finance
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080&h=1920&fit=crop&q=80', // dark 3D fluid
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1080&h=1920&fit=crop&q=80', // digital code
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1080&h=1920&fit=crop&q=80', // cyber security
  ];

  try {
    const fallbackUrl = fallbacks[fallbackIndex % fallbacks.length];
    console.log(`[Renderer] Downloading fallback background: ${fallbackUrl.substring(0, 60)}...`);
    const response = await fetch(fallbackUrl);
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      console.log('[Renderer] Successfully loaded fallback background.');
      return Buffer.from(arrayBuffer);
    }
  } catch (error) {
    console.warn('[Renderer] Fallback download failed:', error.message);
  }

  // Absolute last resort: 1px transparent PNG
  console.error('[Renderer] All image sources failed. Using minimal placeholder.');
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
}

/**
 * Generates card screenshots using Playwright.
 * @param {object} generatedJson The JSON output from generator.js
 * @param {string|null} newsImageUrl The og:image URL from the selected article
 * @returns {Promise<Array<string>>} List of generated PNG image file paths.
 */
async function renderCardImages(generatedJson, newsImageUrl = null) {
  const slides = [];
  const themeColor = generatedJson.theme_color || '#3B82F6';

  console.log(`[Renderer] Theme: unified (${themeColor})`);

  // Load mascot
  const mascotBase64 = loadMascotBase64();

  // Download the single news image (used for all 3 cards with different treatments)
  console.log('[Renderer] Downloading news article image...');
  const newsImageBuffer = await downloadNewsImage(newsImageUrl, 0);
  const newsImageBase64 = newsImageBuffer.toString('base64');

  // Render PNGs using Playwright
  console.log('[Renderer] Launching Playwright browser...');
  const browser = await chromium.launch({ headless: true });
  
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1080, height: 1920 });

    const cardTypes = ['title', 'fact', 'action'];
    const cardContents = [generatedJson.card1, generatedJson.card2, generatedJson.card3];

    for (let i = 0; i < 3; i++) {
      const outputPath = `slide_${i + 1}.png`;
      console.log(`[Renderer] Rendering slide ${i + 1} (${cardTypes[i]}) -> ${outputPath}...`);
      
      const htmlContent = buildThemeHtml(
        'unified',
        themeColor,
        cardTypes[i],
        cardContents[i],
        newsImageBase64,
        generatedJson.news_date,
        mascotBase64
      );

      await page.setContent(htmlContent);
      
      // Wait for fonts to load
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);

      await page.screenshot({
        path: outputPath,
        type: 'png',
        omitBackground: false,
      });

      slides.push(outputPath);
      console.log(`[Renderer] Saved slide ${i + 1} successfully.`);
    }

  } catch (error) {
    console.error('[Renderer] Error during rendering:', error);
    throw error;
  } finally {
    await browser.close();
    console.log('[Renderer] Playwright browser closed.');
  }

  return slides;
}

module.exports = {
  renderCardImages,
};
