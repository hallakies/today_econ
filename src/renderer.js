const { chromium } = require('playwright');
const config = require('../config');
const { buildThemeHtml } = require('./templates');

/**
 * Downloads an image from Pollinations.ai or falls back to curated theme-specific 3D fluid gradient images.
 * @param {string} prompt The visual description of the image to generate.
 * @param {number} fallbackIndex Index for selecting a fallback image if generation fails.
 * @param {string} themeName The current template theme name.
 * @returns {Promise<Buffer>} The image binary data.
 */
async function generateImage(prompt, fallbackIndex = 0, themeName = 'obsidian') {
  const cleanPrompt = prompt.trim();
  console.log(`[Renderer] Generating image for prompt: "${cleanPrompt.substring(0, 60)}..."`);
  
  // Try Pollinations.ai first (uses Flux/Stable Diffusion, free & keyless)
  try {
    console.log('[Renderer] Attempting Pollinations.ai image generation...');
    const encodedPrompt = encodeURIComponent(cleanPrompt);
    
    // Use the official gen.pollinations.ai endpoint with negative prompt to prevent text in images
    const negativePrompt = encodeURIComponent('text, letters, words, characters, alphabet, watermark, low quality, blurry, logo, signature, national flag, coat of arms, emblem, badge, crest, heraldry, banner with symbols, country flag');
    const pollinationsUrl = `https://gen.pollinations.ai/image/${encodedPrompt}?width=800&height=800&nologo=true&seed=${Math.floor(Math.random() * 100000)}&negative=${negativePrompt}`;
    
    const headers = {};
    if (config.pollinationsApiKey) {
      headers['Authorization'] = `Bearer ${config.pollinationsApiKey}`;
      console.log('[Renderer] Using POLLINATIONS_API_KEY for authorization.');
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout
    
    const response = await fetch(pollinationsUrl, { headers, signal: controller.signal });
    clearTimeout(timeout);
    
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      // Validate: reject suspiciously small images (< 5KB likely means error/placeholder)
      if (buffer.length < 5000) {
        throw new Error(`Image too small (${buffer.length} bytes), likely a placeholder or error`);
      }
      console.log(`[Renderer] Successfully generated image via Pollinations.ai (${(buffer.length / 1024).toFixed(1)}KB).`);
      return buffer;
    } else {
      throw new Error(`Pollinations API returned status ${response.status}`);
    }
  } catch (error) {
    console.warn('[Renderer] Pollinations API failed. Attempting Hugging Face Inference API (FLUX.1-schnell)...', error.message);
    
    try {
      if (!config.hfToken) {
        throw new Error('HF_TOKEN is not configured.');
      }
      
      const hfResponse = await fetch('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
        headers: {
          'Authorization': `Bearer ${config.hfToken}`,
          'Content-Type': 'application/json'
        },
        method: 'POST',
        body: JSON.stringify({
          inputs: cleanPrompt + ", high quality, detailed, trending on artstation",
          parameters: {
            guidance_scale: 7.5,
            num_inference_steps: 4,
            width: 800,
            height: 800
          }
        }),
      });
      
      if (hfResponse.ok) {
        const arrayBuffer = await hfResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (buffer.length < 5000) {
          throw new Error(`HF Image too small (${buffer.length} bytes)`);
        }
        console.log(`[Renderer] Successfully generated image via Hugging Face (${(buffer.length / 1024).toFixed(1)}KB).`);
        return buffer;
      } else {
        throw new Error(`Hugging Face API returned status ${hfResponse.status}`);
      }
    } catch (hfError) {
      console.warn('[Renderer] Hugging Face API failed as well. Loading curated theme-specific 3D fluid gradient image...', hfError.message);
      
      // Curated 3D abstract fluid gradient artworks, 100% cohesive and matching theme colors (9:16 aspect ratio)
      // 6 images per theme for variety
      const obsidianFallbacks = [
      'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1080&h=1920&fit=crop&q=80', // trading chart
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1080&h=1920&fit=crop&q=80', // dark premium architecture
      'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=1080&h=1920&fit=crop&q=80', // abstract finance
      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080&h=1920&fit=crop&q=80'  // dark 3D fluid
    ];
    const ivoryFallbacks = [
      'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1080&h=1920&fit=crop&q=80', // modern architecture real estate
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1080&h=1920&fit=crop&q=80', // premium interior
      'https://images.unsplash.com/photo-1449844908441-8829872d2607?w=1080&h=1920&fit=crop&q=80', // warm city view
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1080&h=1920&fit=crop&q=80'  // premium mansion
    ];
    const cyberFallbacks = [
      'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080&h=1920&fit=crop&q=80', // circuit board tech
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1080&h=1920&fit=crop&q=80', // digital code cyber
      'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1080&h=1920&fit=crop&q=80', // cyber security
      'https://images.unsplash.com/photo-1633259584604-afdc243122ea?w=1080&h=1920&fit=crop&q=80'  // purple neon tech
    ];

    let fallbacks = obsidianFallbacks;
    const normalizedTheme = (themeName || 'obsidian').toLowerCase();
    if (normalizedTheme === 'ivory') {
      fallbacks = ivoryFallbacks;
    } else if (normalizedTheme === 'cyber') {
      fallbacks = cyberFallbacks;
    }
    
    try {
      const fallbackUrl = fallbacks[fallbackIndex % fallbacks.length];
      console.log(`[Renderer] Downloading theme-specific Unsplash fallback: ${fallbackUrl}`);
      const response = await fetch(fallbackUrl);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        console.log('[Renderer] Successfully loaded curated Unsplash fallback image.');
        return Buffer.from(arrayBuffer);
      } else {
        throw new Error(`Unsplash fallback responded with status ${response.status}`);
      }
    } catch (unsplashError) {
      console.error('[Renderer] Unsplash fallback failed as well.', unsplashError.message || unsplashError);
      // Return a dummy transparent PNG buffer as an absolute last resort
      return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    }
  }
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
  const card1Buffer = await generateImage(generatedJson.card1.image_prompt, 0, themeName);
  const card2Buffer = await generateImage(generatedJson.card2.image_prompt, 1, themeName);
  const card3Buffer = await generateImage(generatedJson.card3.image_prompt, 2, themeName);

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
        cardImages[i],
        generatedJson.news_date
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
