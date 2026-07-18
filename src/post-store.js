const fs = require('fs');
const path = require('path');
const config = require('../config');

function ensureStore(filePath = config.postsFile) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '[]\n', 'utf8');
}

function loadPosts(filePath = config.postsFile) {
  ensureStore(filePath);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw new Error(`[Post Store] Invalid JSON in ${filePath}: ${error.message}`);
  }
}

function savePosts(posts, filePath = config.postsFile) {
  ensureStore(filePath);
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(posts, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function addPublishedPost(post, filePath = config.postsFile) {
  const posts = loadPosts(filePath);
  if (posts.some(existing => existing.mediaId === post.mediaId)) return posts;
  posts.push({ metrics: {}, ...post });
  savePosts(posts, filePath);
  return posts;
}

function normalizeArticleUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function findPublishedPost({ articleUrl, format }, filePath = config.postsFile) {
  const normalizedUrl = normalizeArticleUrl(articleUrl);
  return loadPosts(filePath).find(post => (
    normalizedUrl &&
    normalizeArticleUrl(post.articleUrl) === normalizedUrl &&
    post.format === format &&
    post.mediaId
  )) || null;
}

function upsertPublishedPost(post, filePath = config.postsFile) {
  const posts = loadPosts(filePath);
  const normalizedUrl = normalizeArticleUrl(post.articleUrl);
  const index = posts.findIndex(existing => (
    (post.mediaId && existing.mediaId === post.mediaId) ||
    (
      normalizedUrl &&
      normalizeArticleUrl(existing.articleUrl) === normalizedUrl &&
      existing.format === post.format
    )
  ));
  if (index >= 0) {
    const existing = posts[index];
    posts[index] = {
      ...existing,
      ...post,
      metrics: post.metrics || existing.metrics || {},
    };
  } else {
    posts.push({ metrics: {}, ...post });
  }
  savePosts(posts, filePath);
  return posts;
}

function metricRecord(value) {
  if (value && typeof value === 'object' && 'status' in value) return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? { value: numeric, status: 'ok' } : { value: null, status: 'unavailable', reason: 'missing metric' };
}

function metricNumber(value) {
  const record = metricRecord(value);
  return record.status === 'ok' ? Number(record.value) : null;
}

function calculateEngagementRate(metrics) {
  const reach = metricNumber(metrics.reach);
  const interactionRecord = metrics.total_interactions !== undefined
    ? metricRecord(metrics.total_interactions)
    : null;
  const componentValues = ['likes', 'comments', 'saved', 'shares'].map(key => metricNumber(metrics[key]));
  const interactions = interactionRecord || (componentValues.every(value => value !== null)
    ? { value: componentValues.reduce((sum, value) => sum + value, 0), status: 'ok' }
    : { value: null, status: 'unavailable', reason: 'interaction metrics unavailable' });
  if (reach === null || interactions.status !== 'ok' || reach <= 0) {
    return { value: null, status: 'unavailable', reason: reach === null ? 'reach unavailable' : 'interaction metrics unavailable' };
  }
  return { value: Number(((interactions.value / reach) * 100).toFixed(2)), status: 'ok' };
}

module.exports = {
  addPublishedPost,
  calculateEngagementRate,
  findPublishedPost,
  metricNumber,
  metricRecord,
  ensureStore,
  loadPosts,
  savePosts,
  upsertPublishedPost,
};
