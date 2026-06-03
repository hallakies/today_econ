const { chromium } = require('playwright');
const config = require('../config');
const { buildThemeHtml } = require('./templates');

/**
 * Downloads an image from Hugging Face FLUX.1-schnell or falls back to Pollinations.ai.
 * @param {string} prompt The visual description of the image to generate.
 * @returns {Promise<Buffer>} The image binary data.
 */
async function generateImage(prompt) {
  const cleanPrompt = prompt.trim();
  console.log(`[Renderer] Generating image for prompt: "${cleanPrompt.substring(0, 60)}..."`);
  
  // Try Hugging Face first
  if (config.hfToken) {
    try {
      console.log('[Renderer] Attempting HF FLUX.1-schnell API...');
      const response = await fetch(
        'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.hfToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputs: cleanPrompt }),
        }
      );

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        console.log('[Renderer] Successfully generated image via Hugging Face.');
        return Buffer.from(arrayBuffer);
      } else {
        const errorText = await response.text();
        console.warn(`[Renderer] HF API responded with status ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.warn('[Renderer] HF API failed, attempting fallback...', error);
    }
  } else {
    console.log('[Renderer] No HF_TOKEN config found. Using Pollinations.ai directly.');
  }

  // Fallback to Pollinations.ai (uses Flux/Stable Diffusion, free & keyless)
  try {
    console.log('[Renderer] Attempting Pollinations.ai fallback...');
    const encodedPrompt = encodeURIComponent(cleanPrompt);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=800&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
    
    const response = await fetch(pollinationsUrl);
    if (!response.ok) {
      throw new Error(`Pollinations API returned status ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    console.log('[Renderer] Successfully generated image via Pollinations.ai fallback.');
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('[Renderer] All image generation APIs failed.', error);
    // Return a dummy transparent PNG buffer as an absolute fallback
    return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  }
}

/**
 * Generates card screenshots using Playwright.
 * @param {object} generatedJson The JSON output from generator.js
 * @returns {Promise<Array<string>>} List of generated PNG image file paths.
 */
async function renderCardImages(generatedJson) {
  const slides = [];
  const themeName = generatedJson.template_theme || 'obsidian';
  const themeColor = generatedJson.theme_color || '#3b82f6';

  console.log(`[Renderer] Chosen theme: ${themeName} (${themeColor})`);

  // 1. Generate AI Illustrations for each card
  console.log('[Renderer] Starting image generation for 3 cards...');
  const card1Buffer = await generateImage(generatedJson.card1.image_prompt);
  const card2Buffer = await generateImage(generatedJson.card2.image_prompt);
  const card3Buffer = await generateImage(generatedJson.card3.image_prompt);

  // Convert buffers to base64 strings
  const card1Base64 = card1Buffer.toString('base64');
  const card2Base64 = card2Buffer.toString('base64');
  const card3Base64 = card3Buffer.toString('base64');

  // 2. Render PNGs using Playwright
  console.log('[Renderer] Launching Playwright browser...');
  const browser = await chromium.launch({ headless: true });
  
  try {
    const page = await browser.newPage();
    // 9:16 aspect ratio standard for mobile/instagram reels (1080x1920 viewport)
    await page.setViewportSize({ width: 1080, height: 1920 });

    const cardTypes = ['title', 'fact', 'action'];
    const cardContents = [generatedJson.card1, generatedJson.card2, generatedJson.card3];
    const cardImages = [card1Base64, card2Base64, card3Base64];

    for (let i = 0; i < 3; i++) {
      const outputPath = `slide_${i + 1}.png`;
      console.log(`[Renderer] Rendering slide ${i + 1} (${cardTypes[i]}) -> ${outputPath}...`);
      
      const htmlContent = buildThemeHtml(
        themeName,
        themeColor,
        cardTypes[i],
        cardContents[i],
        cardImages[i]
      );

      await page.setContent(htmlContent);
      
      // Wait for fonts and base64 images to load completely
      await page.evaluate(() => document.fonts.ready);
      
      // Additional small wait to ensure smooth rendering buffer
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
    console.error('[Renderer] Error during HTML to Image rendering:', error);
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
