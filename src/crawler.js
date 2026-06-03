const Parser = require('rss-parser');
const parser = new Parser();

/**
 * Fetches and parses economic news articles from an RSS feed.
 * @param {string} rssUrl The URL of the RSS feed to fetch.
 * @returns {Promise<Array<{title: string, link: string, pubDate: string, summary: string}>>}
 */
async function fetchNews(rssUrl) {
  try {
    console.log(`[Crawler] Fetching RSS feed from: ${rssUrl}`);
    const feed = await parser.parseURL(rssUrl);
    
    if (!feed.items || feed.items.length === 0) {
      console.warn('[Crawler] No news items found in feed.');
      return [];
    }

    const items = feed.items.map(item => {
      // Extract cleanest summary possible
      const summary = item.contentSnippet || item.content || item.description || '';
      return {
        title: item.title ? item.title.trim() : '',
        link: item.link ? item.link.trim() : '',
        pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
        summary: summary.trim(),
      };
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
};
