const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchArticleBody } = require('../src/crawler');

test('collapses real whitespace when extracting article text', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('<article>\n  대출\t\t규제   완화\n논의 </article>', { status: 200 });
  try {
    const text = await fetchArticleBody('https://example.com/article');
    assert.equal(text, '대출 규제 완화 논의');
  } finally {
    global.fetch = originalFetch;
  }
});
