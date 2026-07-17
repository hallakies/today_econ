const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cleanupExpiredReleases, createTemporaryRelease } = require('../src/github-assets');

function jsonResponse(payload, status = 200) {
  return new Response(payload === null ? '' : JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

test('uploads images as prerelease assets without committing them', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'today-econ-assets-'));
  const files = ['a.png', 'b.png'].map(name => {
    const file = path.join(directory, name);
    fs.writeFileSync(file, Buffer.from('png'));
    return file;
  });
  let uploadCount = 0;
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith('/releases') && options.method === 'POST') {
      return jsonResponse({ id: 7, upload_url: 'https://uploads.github.com/release{?name}', html_url: 'release', created_at: '2026-07-15T00:00:00Z' });
    }
    if (String(url).startsWith('https://uploads.github.com/release')) {
      uploadCount += 1;
      return jsonResponse({ id: uploadCount, browser_download_url: `https://github.com/download/${uploadCount}.png` });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const release = await createTemporaryRelease({
    imagePaths: files,
    token: 'token',
    repository: 'owner/repo',
    runId: '42',
    fetchImpl,
  });
  assert.equal(release.releaseId, 7);
  assert.equal(release.imageUrls.length, 2);
  assert.match(release.tag, /^instagram-assets-42-/);
});

test('uploads a Reel alongside card images and returns typed public URLs', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'today-econ-assets-'));
  const files = ['slide_1.png', 'slide_2.png', 'reel.mp4'].map(name => {
    const file = path.join(directory, name);
    fs.writeFileSync(file, Buffer.from(name));
    return file;
  });
  let uploadCount = 0;
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith('/releases') && options.method === 'POST') {
      return jsonResponse({ id: 8, upload_url: 'https://uploads.github.com/release{?name}', html_url: 'release', created_at: '2026-07-15T00:00:00Z' });
    }
    if (String(url).startsWith('https://uploads.github.com/release')) {
      uploadCount += 1;
      const name = new URL(url).searchParams.get('name');
      return jsonResponse({ id: uploadCount, name, browser_download_url: `https://github.com/download/${name}` });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const release = await createTemporaryRelease({
    assetPaths: files.map((file, index) => ({ path: file, filename: path.basename(file), contentType: index === 2 ? 'video/mp4' : 'image/png' })),
    token: 'token',
    repository: 'owner/repo',
    runId: '43',
    fetchImpl,
  });
  assert.equal(release.imageUrls.length, 2);
  assert.equal(release.videoUrl, 'https://github.com/download/reel.mp4');
});

test('deletes only expired today.econ prereleases and their tags', async () => {
  const deleted = [];
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes('/releases?')) {
      return jsonResponse([
        { id: 1, prerelease: true, tag_name: 'instagram-assets-old', created_at: '2026-07-10T00:00:00Z' },
        { id: 2, prerelease: true, tag_name: 'other-release', created_at: '2026-07-10T00:00:00Z' },
        { id: 3, prerelease: true, tag_name: 'instagram-assets-new', created_at: '2026-07-15T00:00:00Z' },
      ]);
    }
    if (options.method === 'DELETE') {
      deleted.push(String(url));
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const removed = await cleanupExpiredReleases({
    token: 'token',
    repository: 'owner/repo',
    now: new Date('2026-07-15T12:00:00Z'),
    fetchImpl,
  });
  assert.deepEqual(removed, ['instagram-assets-old']);
  assert.equal(deleted.length, 2);
});
