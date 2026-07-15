const fs = require('fs');
const path = require('path');

const RELEASE_TAG_PREFIX = 'instagram-assets-';

function parseRepository(repository) {
  const [owner, repo] = String(repository || '').split('/');
  if (!owner || !repo) throw new Error('[GitHub Assets] GITHUB_REPOSITORY must be owner/repo.');
  return { owner, repo };
}

async function githubRequest(url, options = {}, token, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'today-econ-github-actions',
      ...(options.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`[GitHub Assets] ${response.status}: ${payload?.message || text}`);
  }
  return payload;
}

async function createTemporaryRelease({
  imagePaths,
  token,
  repository,
  runId = Date.now().toString(),
  targetCommitish,
  fetchImpl = fetch,
}) {
  if (!token) throw new Error('[GitHub Assets] Missing GITHUB_TOKEN.');
  if (!Array.isArray(imagePaths) || imagePaths.length < 2) {
    throw new Error('[GitHub Assets] At least two carousel images are required.');
  }
  const { owner, repo } = parseRepository(repository);
  const tag = `${RELEASE_TAG_PREFIX}${runId}-${Date.now()}`;
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
  const release = await githubRequest(`${apiBase}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: targetCommitish || undefined,
      name: `Temporary Instagram assets ${runId}`,
      body: 'Temporary public image assets for Instagram ingestion. Automatically deleted after 72 hours.',
      draft: false,
      prerelease: true,
    }),
  }, token, fetchImpl);

  const uploadBase = release.upload_url.replace(/\{.*$/, '');
  const assets = [];
  try {
    for (let index = 0; index < imagePaths.length; index += 1) {
      const imagePath = imagePaths[index];
      if (!fs.existsSync(imagePath)) throw new Error(`Image not found: ${imagePath}`);
      const filename = `slide_${index + 1}.png`;
      const uploaded = await githubRequest(`${uploadBase}?name=${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: fs.readFileSync(imagePath),
      }, token, fetchImpl);
      assets.push({ name: filename, url: uploaded.browser_download_url, id: uploaded.id });
    }
  } catch (error) {
    await deleteTemporaryRelease({ releaseId: release.id, tag, token, repository, fetchImpl }).catch(() => {});
    throw error;
  }

  return {
    releaseId: release.id,
    tag,
    htmlUrl: release.html_url,
    createdAt: release.created_at,
    assets,
    imageUrls: assets.map(asset => asset.url),
  };
}

async function deleteTemporaryRelease({ releaseId, tag, token, repository, fetchImpl = fetch }) {
  const { owner, repo } = parseRepository(repository);
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
  if (releaseId) {
    await githubRequest(`${apiBase}/releases/${releaseId}`, { method: 'DELETE' }, token, fetchImpl);
  }
  if (tag) {
    try {
      await githubRequest(`${apiBase}/git/refs/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' }, token, fetchImpl);
    } catch (error) {
      if (!/404/.test(error.message)) throw error;
    }
  }
}

async function cleanupExpiredReleases({ token, repository, maxAgeHours = 72, now = new Date(), fetchImpl = fetch }) {
  if (!token || !repository) return [];
  const { owner, repo } = parseRepository(repository);
  const releases = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`,
    {},
    token,
    fetchImpl
  );
  const cutoff = now.getTime() - maxAgeHours * 60 * 60 * 1000;
  const expired = releases.filter(release =>
    release.prerelease &&
    release.tag_name.startsWith(RELEASE_TAG_PREFIX) &&
    new Date(release.created_at).getTime() <= cutoff
  );
  for (const release of expired) {
    await deleteTemporaryRelease({
      releaseId: release.id,
      tag: release.tag_name,
      token,
      repository,
      fetchImpl,
    });
  }
  return expired.map(release => release.tag_name);
}

module.exports = {
  RELEASE_TAG_PREFIX,
  cleanupExpiredReleases,
  createTemporaryRelease,
  deleteTemporaryRelease,
  parseRepository,
};
