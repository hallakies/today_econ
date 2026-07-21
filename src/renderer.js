const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { chromium } = require('playwright');
const config = require('../config');
const { buildThemeHtml } = require('./templates');

// Path to the mascot image asset
const MASCOT_PATH = path.join(__dirname, '..', 'assets', 'mascot.png');

/**
 * Converts browser layout measurements into actionable render failures.
 * Keeping this outside Playwright makes the density contract unit-testable
 * without launching a browser.
 */
function validateSlideLayout(layout, slideNumber = 1) {
  const errors = [];
  if (!layout || layout.missing) {
    errors.push('slide container is missing');
    return { ok: false, errors };
  }
  if (layout.cardType === 'title') {
    if (layout.titleLineCount > 2) errors.push(`cover title wraps to ${layout.titleLineCount} lines (max 2)`);
    if (layout.subtitleLineCount > 1) errors.push(`cover subtitle wraps to ${layout.subtitleLineCount} lines (must be 1)`);
  }
  if (layout.cardType === 'fact' && layout.statsCount > 2) {
    errors.push(`fact card renders ${layout.statsCount} stat panels (max 2)`);
  }
  if (layout.cardType === 'action') {
    if (layout.coreInsightCount !== 1) errors.push('action card needs one compact 오늘경제 한 줄 생각 block');
    if (layout.actionBulletCount !== 3) {
      errors.push(`action card renders ${layout.actionBulletCount} bullets (expected 2 forecasts + 1 action)`);
    }
  }
  if (layout.boxOverflow) {
    const nodes = layout.overflowNodes?.length ? `: ${layout.overflowNodes.join(', ')}` : '';
    errors.push(`content exceeds its box${nodes}`);
  }
  if (layout.rectOverflow) errors.push('content extends outside the 1080x1350 slide bounds');
  if (layout.invalidText) errors.push('visible text contains undefined/null or an empty required block');
  if (layout.emptyBulletCount > 0) errors.push(`${layout.emptyBulletCount} bullet(s) are empty`);
  return { ok: errors.length === 0, errors: errors.map(error => `slide ${slideNumber}: ${error}`) };
}

function createEditorialBackdrop(moneyChannel = 'mixed', themeColor = '#5C8DFF', storySeed = '') {
  const motifs = {
    credit: '<path d="M110 980 C260 860 330 1080 480 900 S720 1020 950 650" fill="none" stroke="#E8C26A" stroke-width="22" stroke-linecap="round"/><rect x="170" y="270" width="500" height="370" rx="42" fill="#FFFFFF" fill-opacity=".06" stroke="#FFFFFF" stroke-opacity=".22" stroke-width="4"/><path d="M230 390H590M230 470H530M230 550H470" stroke="#FFFFFF" stroke-opacity=".34" stroke-width="22" stroke-linecap="round"/>',
    housing: '<path d="M140 920V650L370 450L600 650V920M690 920V520L860 360L1030 520V920" fill="#FFFFFF" fill-opacity=".08" stroke="#FFFFFF" stroke-opacity=".26" stroke-width="7"/><path d="M90 1020H990" stroke="#E8C26A" stroke-width="12" stroke-linecap="round"/>',
    stocks: '<path d="M110 980L280 760L430 840L590 510L750 620L960 280" fill="none" stroke="#E8C26A" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/><circle cx="960" cy="280" r="28" fill="#E8C26A"/>',
    living_cost: '<path d="M220 480H820L750 920H290L220 480Z" fill="#FFFFFF" fill-opacity=".08" stroke="#FFFFFF" stroke-opacity=".26" stroke-width="7"/><path d="M360 480C360 260 680 260 680 480M360 650H680M360 760H620" fill="none" stroke="#E8C26A" stroke-width="20" stroke-linecap="round"/>',
    tax: '<rect x="260" y="260" width="560" height="780" rx="42" fill="#FFFFFF" fill-opacity=".08" stroke="#FFFFFF" stroke-opacity=".26" stroke-width="7"/><path d="M340 440H740M340 540H690M340 640H730M340 740H610" stroke="#E8C26A" stroke-width="22" stroke-linecap="round"/>',
    savings: '<rect x="185" y="310" width="710" height="520" rx="70" fill="#FFFFFF" fill-opacity=".08" stroke="#FFFFFF" stroke-opacity=".25" stroke-width="7"/><circle cx="540" cy="565" r="145" fill="none" stroke="#E8C26A" stroke-width="24"/><path d="M540 465V665M470 520H590C660 520 660 610 590 610H485" fill="none" stroke="#E8C26A" stroke-width="22" stroke-linecap="round"/><path d="M220 950H860" stroke="#FFFFFF" stroke-opacity=".35" stroke-width="18" stroke-linecap="round"/>',
    mixed: '<circle cx="540" cy="650" r="300" fill="#FFFFFF" fill-opacity=".05" stroke="#FFFFFF" stroke-opacity=".18" stroke-width="7"/><path d="M210 930C350 680 510 940 670 650C760 490 870 580 980 360" fill="none" stroke="#E8C26A" stroke-width="22" stroke-linecap="round"/>',
  };
  const motif = motifs[moneyChannel] || motifs.mixed;
  const seed = [...String(storySeed)].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 17);
  const shiftX = (seed % 121) - 60;
  const shiftY = ((seed >>> 7) % 101) - 50;
  const rotation = ((seed >>> 14) % 9) - 4;
  const orbitX = 220 + (seed % 640);
  const orbitY = 250 + ((seed >>> 5) % 700);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#081426"/><stop offset=".56" stop-color="#16243C"/><stop offset="1" stop-color="#0A0F1A"/></linearGradient>
      <radialGradient id="glow" cx=".78" cy=".24" r=".7"><stop stop-color="${themeColor}" stop-opacity=".42"/><stop offset="1" stop-color="${themeColor}" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1080" height="1350" fill="url(#bg)"/><rect width="1080" height="1350" fill="url(#glow)"/>
    <circle cx="${orbitX}" cy="${orbitY}" r="${140 + (seed % 120)}" fill="${themeColor}" fill-opacity=".08"/>
    <g opacity=".9" transform="translate(${shiftX} ${shiftY}) rotate(${rotation} 540 675)">${motif}</g>
    <g opacity=".12" stroke="#FFFFFF"><path d="M0 180H1080M0 430H1080M0 1180H1080"/><path d="M160 0V1350M900 0V1350"/></g>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

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

  console.log(`[Renderer] Theme: editorial (${themeColor})`);

  // Load mascot
  const mascotBase64 = loadMascotBase64();

  // Use a deterministic, channel-specific financial backdrop. This prevents
  // unrelated AI portraits from being paired with sensitive economic stories.
  let newsImageBase64;
  if (newsImageUrl) {
    const imageBuffer = await downloadNewsImage(newsImageUrl);
    newsImageBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
    console.log('[Renderer] Using the article image as the story-specific background.');
  } else {
    const storySeed = generatedJson.analysis?.source_title || generatedJson.card1?.title || '';
    newsImageBase64 = createEditorialBackdrop(generatedJson.analysis?.topic || generatedJson.analysis?.money_channel, themeColor, storySeed);
    console.log('[Renderer] Using a story-varied money-mechanism background.');
  }

  // Render PNGs using Playwright
  console.log('[Renderer] Launching Playwright browser...');
  const browser = await chromium.launch({ headless: true });
  
  try {
    const page = await browser.newPage();
    const renderedHashes = new Set();
    await page.setViewportSize({ width: 1080, height: 1350 });

    const cardTypes = ['title', 'fact'];
    const cardContents = [generatedJson.card1, generatedJson.card2];

    if (generatedJson.card4) {
      // 4-card structure: title, fact, audience, action
      cardTypes.push('audience');
      cardContents.push(generatedJson.card3);
      cardTypes.push('action');
      cardContents.push(generatedJson.card4);
    } else {
      // 3-card structure: title, fact, action
      cardTypes.push('action');
      cardContents.push(generatedJson.card3);
    }

    const slideCount = cardTypes.length;

    for (let i = 0; i < slideCount; i++) {
      const outputPath = `slide_${i + 1}.png`;
      console.log(`[Renderer] Rendering slide ${i + 1} (${cardTypes[i]}) -> ${outputPath}...`);
      
      const htmlContent = buildThemeHtml(
        'unified',
        themeColor,
        cardTypes[i],
        cardContents[i],
        newsImageBase64,
        generatedJson.news_date,
        mascotBase64,
        generatedJson.core_insight,
        i + 1,
        slideCount,
        generatedJson.series_label
      );

      await page.setContent(htmlContent);
      
      // Wait for fonts to load
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);

      const layout = await page.evaluate(() => {
        const root = document.querySelector('.slide-container');
        if (!root) return { missing: true };
        const rootRect = root.getBoundingClientRect();
        const title = root.querySelector('[data-cover-title]');
        const subtitle = root.querySelector('[data-cover-subtitle]');
        const lineCount = node => {
          if (!node) return 0;
          const style = getComputedStyle(node);
          const lineHeight = Number.parseFloat(style.lineHeight);
          if (!Number.isFinite(lineHeight) || lineHeight <= 0) return 1;
          return Math.max(1, Math.round(node.getBoundingClientRect().height / lineHeight));
        };
        const layoutNodes = [...root.querySelectorAll('main, main > div, .card-bullets, .bullet-text, .fact-bullet-text, .core-insight-text, .stat-panel')];
        const overflowNodes = layoutNodes
          .filter(node => node.scrollHeight > node.clientHeight + 2 || node.scrollWidth > node.clientWidth + 2)
          .map(node => node.dataset?.cardType || node.className?.split(' ').find(Boolean) || node.tagName.toLowerCase());
        const bulletNodes = [...root.querySelectorAll('.bullet-text, .fact-bullet-text')];
        const emptyBulletCount = bulletNodes.filter(node => !node.innerText.trim()).length;
        const invalidText = /(?:^|\s)(?:undefined|null)(?:\s|$)/i.test(document.body.innerText)
          || bulletNodes.some(node => !node.innerText.trim());
        const rectOverflow = [...root.children].some(child => {
          const rect = child.getBoundingClientRect();
          return rect.left < rootRect.left - 1 || rect.top < rootRect.top - 1 || rect.right > rootRect.right + 1 || rect.bottom > rootRect.bottom + 1;
        });
        return {
          missing: false,
          cardType: root.dataset.cardType || (title ? 'title' : root.querySelector('.action-bullets') ? 'action' : 'content'),
          titleLineCount: lineCount(title),
          subtitleLineCount: lineCount(subtitle),
          statsCount: root.querySelectorAll('[data-stat-panel]').length,
          actionBulletCount: root.querySelectorAll('.action-bullet').length,
          coreInsightCount: root.querySelectorAll('.core-insight-text').length,
          emptyBulletCount,
          boxOverflow: overflowNodes.length > 0,
          overflowNodes,
          rectOverflow,
          invalidText,
        };
      });
      const validation = validateSlideLayout(layout, i + 1);
      if (!validation.ok) throw new Error(`[Renderer] ${validation.errors.join('; ')}`);

      await page.screenshot({
        path: outputPath,
        type: 'png',
        omitBackground: false,
      });

      const imageHash = crypto.createHash('sha256').update(fs.readFileSync(outputPath)).digest('hex');
      if (renderedHashes.has(imageHash)) {
        throw new Error(`[Renderer] Duplicate slide image detected at ${outputPath}; refusing to publish a repeated card.`);
      }
      renderedHashes.add(imageHash);

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
  createEditorialBackdrop,
  downloadNewsImage,
  renderCardImages,
  validateSlideLayout,
};
