const test = require('node:test');
const assert = require('node:assert/strict');
const { dueWindows, buildWeeklyReport } = require('../src/collect-insights');

test('collects each measurement window once', () => {
  const post = { publishedAt: '2026-07-10T00:00:00Z', metrics: { '24h': {} } };
  const due = dueWindows(post, new Date('2026-07-13T01:00:00Z'));
  assert.deepEqual(due.map(item => item.label), ['72h']);
});

test('weekly report ranks by engagement rate', () => {
  const posts = [
    { articleTitle: 'A', permalink: 'https://a', publishedAt: '2026-07-14T00:00:00Z', contentMetadata: { topic: '금리', hook_type: '숫자' }, metrics: { '24h': { reach: 100, engagementRate: 3 } } },
    { articleTitle: 'B', permalink: 'https://b', publishedAt: '2026-07-14T00:00:00Z', contentMetadata: { topic: '부동산', hook_type: '반전' }, metrics: { '24h': { reach: 50, engagementRate: 8 } } },
  ];
  const report = buildWeeklyReport(posts, new Date('2026-07-15T00:00:00Z'));
  assert.match(report, /<https:\/\/b\|B>/);
  assert.match(report, /참여율 8%/);
});
