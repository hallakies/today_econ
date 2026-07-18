const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findPublishedPost, loadPosts, upsertPublishedPost } = require('../src/post-store');

test('upserts one durable record per article format', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'today-econ-post-store-'));
  const file = path.join(directory, 'posts.json');
  upsertPublishedPost({
    mediaId: 'reel-1',
    articleUrl: 'https://example.com/article/',
    format: 'reel',
    permalink: 'https://instagram.com/reel/one',
  }, file);
  upsertPublishedPost({
    mediaId: 'reel-1',
    articleUrl: 'https://example.com/article',
    format: 'reel',
    story: { id: 'story-1' },
  }, file);
  upsertPublishedPost({
    mediaId: 'carousel-1',
    articleUrl: 'https://example.com/article',
    format: 'carousel',
    permalink: 'https://instagram.com/p/one',
  }, file);

  const posts = loadPosts(file);
  assert.equal(posts.length, 2);
  assert.equal(findPublishedPost({ articleUrl: 'https://example.com/article/', format: 'reel' }, file).story.id, 'story-1');
  assert.equal(findPublishedPost({ articleUrl: 'https://example.com/article', format: 'carousel' }, file).mediaId, 'carousel-1');
});
