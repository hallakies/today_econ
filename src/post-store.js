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

function calculateEngagementRate(metrics) {
  const reach = Number(metrics.reach || 0);
  const interactions = Number(
    metrics.total_interactions ??
    (Number(metrics.likes || 0) + Number(metrics.comments || 0) + Number(metrics.saved || 0) + Number(metrics.shares || 0))
  );
  return reach > 0 ? Number(((interactions / reach) * 100).toFixed(2)) : 0;
}

module.exports = {
  addPublishedPost,
  calculateEngagementRate,
  ensureStore,
  loadPosts,
  savePosts,
};
