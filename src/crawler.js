const Parser = require('rss-parser');
const parser = new Parser();

/**
 * Fetches the og:image URL from an article page.
 * @param {string} articleUrl The URL of the news article.
 * @returns {Promise<string|null>} The og:image URL or null if not found.
 */
async function fetchOgImage(articleUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(articleUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TodayEconBot/1.0)',
      },
    });
    clearTimeout(timeout);
    
    if (!response.ok) return null;
    
    const html = await response.text();
    
    // Extract og:image from meta tags
    const ogMatch = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i)
      || html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);
    
    if (ogMatch && ogMatch[1]) {
      const imageUrl = ogMatch[1].trim();
      // Validate it looks like an actual image URL
      if (imageUrl.startsWith('http') && /\.(jpg|jpeg|png|webp|gif)/i.test(imageUrl)) {
        return imageUrl;
      }
      // Some og:image URLs don't have extensions but are still valid
      if (imageUrl.startsWith('http')) {
        return imageUrl;
      }
    }
    
    return null;
  } catch (error) {
    console.warn(`[Crawler] Failed to fetch og:image from ${articleUrl}:`, error.message);
    return null;
  }
}

/**
 * Fetches and parses economic news articles from an RSS feed.
 * @param {string} rssUrl The URL of the RSS feed to fetch.
 * @returns {Promise<Array<{title: string, link: string, pubDate: string, summary: string, imageUrl: string|null}>>}
 */
async function fetchNews(rssUrl) {
  try {
    console.log(`[Crawler] Fetching RSS feed from: ${rssUrl}`);
    const feed = await parser.parseURL(rssUrl);
    
    if (!feed.items || feed.items.length === 0) {
      console.warn('[Crawler] No news items found in feed.');
      return [];
    }

    const items = feed.items
      .map(item => {
        // Extract cleanest summary possible
        const summary = item.contentSnippet || item.content || item.description || '';
        return {
          title: item.title ? item.title.trim() : '',
          link: item.link ? item.link.trim() : '',
          pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
          summary: summary.trim().substring(0, 300),
          imageUrl: null, // Will be populated after selection
        };
      })
      .filter(item => {
        const lowerTitle = item.title.toLowerCase();
        // Filter out completely irrelevant news types early
        if (lowerTitle.includes('[인사]')) return false;
        if (lowerTitle.includes('[부고]')) return false;
        if (lowerTitle.includes('[동정]')) return false;
        if (lowerTitle.includes('[알림]')) return false;
        if (lowerTitle.includes('[게시판]')) return false;
        if (lowerTitle.includes('[부음]')) return false;
        return true;
      });

    console.log(`[Crawler] Successfully parsed ${items.length} items.`);
    return items;
  } catch (error) {
    console.error('[Crawler] Failed to parse RSS feed:', error);
    throw error;
  }
}

module.exports = {
  fetchNews,
  fetchOgImage,
};
