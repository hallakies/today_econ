const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPublicationRefs } = require('../src/slack');

test('reports Reel and Carousel links independently', () => {
  const message = buildPublicationRefs(null, {
    reel: { permalink: 'https://instagram.com/reel/one' },
    carousel: { permalink: 'https://instagram.com/p/one' },
  });
  assert.match(message, /릴스.*reel\/one/);
  assert.match(message, /캐러셀.*p\/one/);
});

test('keeps a single legacy publication compatible', () => {
  const message = buildPublicationRefs({ format: 'reel', permalink: 'https://instagram.com/reel/legacy' });
  assert.match(message, /릴스.*legacy/);
  assert.doesNotMatch(message, /캐러셀/);
});
