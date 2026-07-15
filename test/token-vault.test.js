const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../config');
const { decryptToken, encryptToken, readEncryptedToken, writeEncryptedToken } = require('../src/token-vault');
const { refreshInstagramToken } = require('../src/refresh-instagram-token');

test('encrypts and decrypts a token with authenticated encryption', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const payload = encryptToken('IG-secret-token', key);
  assert.notEqual(payload.ciphertext, 'IG-secret-token');
  assert.equal(decryptToken(payload, key), 'IG-secret-token');
  assert.throws(() => decryptToken(payload, Buffer.alloc(32, 8).toString('base64')));
});

test('writes only ciphertext and reads the original token', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'today-econ-vault-'));
  const filePath = path.join(directory, 'token.enc');
  const key = Buffer.alloc(32, 9).toString('base64');
  writeEncryptedToken('plain-token', filePath, key);
  assert.doesNotMatch(fs.readFileSync(filePath, 'utf8'), /plain-token/);
  assert.equal(readEncryptedToken(filePath, key), 'plain-token');
});

test('refreshes a token and persists the rotated value encrypted', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'today-econ-refresh-'));
  const original = {
    accessToken: config.instagramAccessToken,
    key: config.instagramTokenEncryptionKey,
    file: config.instagramTokenFile,
  };
  config.instagramAccessToken = 'old-token';
  config.instagramTokenEncryptionKey = Buffer.alloc(32, 3).toString('base64');
  config.instagramTokenFile = path.join(directory, 'token.enc');
  try {
    const result = await refreshInstagramToken({
      fetchImpl: async url => {
        assert.equal(new URL(url).searchParams.get('access_token'), 'old-token');
        return new Response(JSON.stringify({ access_token: 'new-token', expires_in: 5184000 }), { status: 200 });
      },
    });
    assert.equal(result.rotated, true);
    assert.equal(readEncryptedToken(config.instagramTokenFile, config.instagramTokenEncryptionKey), 'new-token');
  } finally {
    config.instagramAccessToken = original.accessToken;
    config.instagramTokenEncryptionKey = original.key;
    config.instagramTokenFile = original.file;
  }
});
