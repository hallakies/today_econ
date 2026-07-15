const test = require('node:test');
const assert = require('node:assert/strict');
const { publishCarousel, getMediaInsights } = require('../src/instagram');

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

test('publishes a carousel in the required container order', async () => {
  const calls = [];
  let mediaCreateCount = 0;
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body?.toString() || '' });
    if (String(url).endsWith('/1784/media') && options.method === 'POST') {
      mediaCreateCount += 1;
      return jsonResponse({ id: mediaCreateCount <= 2 ? `child-${mediaCreateCount}` : 'carousel-1' });
    }
    if (/child-|carousel-1/.test(String(url)) && (options.method || 'GET') === 'GET') {
      return jsonResponse({ status_code: 'FINISHED' });
    }
    if (String(url).endsWith('/1784/media_publish')) return jsonResponse({ id: 'post-1' });
    if (String(url).includes('/post-1?')) {
      return jsonResponse({ id: 'post-1', permalink: 'https://instagram.com/p/abc', timestamp: '2026-07-15T00:00:00Z' });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const result = await publishCarousel({
    imageUrls: ['https://example.com/1.png', 'https://example.com/2.png'],
    caption: '테스트 캡션',
    userId: '1784',
    token: 'secret',
    fetchImpl,
  });

  assert.equal(result.id, 'post-1');
  assert.equal(calls.filter(call => call.method === 'POST').length, 4);
  assert.match(calls[4].body, /media_type=CAROUSEL/);
  assert.match(calls[4].body, /children=child-1%2Cchild-2/);
  assert.ok(calls.every(call => !call.url.includes('secret')));
});

test('collects supported metrics individually if the bulk request fails', async () => {
  const fetchImpl = async url => {
    const parsed = new URL(url);
    const metric = parsed.searchParams.get('metric');
    if (metric.includes(',')) return jsonResponse({ error: { message: 'unsupported metric combination' } }, 400);
    if (metric === 'reach') return jsonResponse({ data: [{ name: 'reach', values: [{ value: 120 }] }] });
    return jsonResponse({ error: { message: 'unsupported' } }, 400);
  };
  const metrics = await getMediaInsights({ mediaId: 'post-1', token: 'secret', metrics: ['reach', 'views'], fetchImpl });
  assert.deepEqual(metrics, { reach: 120 });
});
