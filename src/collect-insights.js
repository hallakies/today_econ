const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getMediaInsights } = require('./instagram');
const { calculateEngagementRate, loadPosts, savePosts } = require('./post-store');
const { sendAnalyticsReport } = require('./slack');
const { resolveInstagramToken } = require('./token-vault');

const WINDOWS = [
  { label: '24h', hours: 24 },
  { label: '72h', hours: 72 },
  { label: '7d', hours: 168 },
];
const STATE_FILE = path.join(__dirname, '..', 'data', 'analytics-state.json');

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { weeklyReports: [] };
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { weeklyReports: [] };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function dueWindows(post, now = new Date()) {
  const ageHours = (now.getTime() - new Date(post.publishedAt).getTime()) / 3600000;
  return WINDOWS.filter(window => ageHours >= window.hours && !post.metrics?.[window.label]);
}

function latestMetrics(post) {
  return post.metrics?.['7d'] || post.metrics?.['72h'] || post.metrics?.['24h'] || null;
}

function buildWeeklyReport(posts, now = new Date()) {
  const since = now.getTime() - 7 * 24 * 3600000;
  const recent = posts.filter(post => new Date(post.publishedAt).getTime() >= since && latestMetrics(post));
  if (recent.length === 0) return '📊 오늘경제 주간 리포트\n이번 주에는 집계 가능한 게시물이 아직 없어요.';

  const ranked = recent
    .map(post => ({ post, metrics: latestMetrics(post) }))
    .sort((a, b) => (b.metrics.engagementRate || 0) - (a.metrics.engagementRate || 0));
  const totals = ranked.reduce((sum, item) => ({
    reach: sum.reach + Number(item.metrics.reach || 0),
    saved: sum.saved + Number(item.metrics.saved || 0),
    shares: sum.shares + Number(item.metrics.shares || 0),
    interactions: sum.interactions + Number(item.metrics.total_interactions || 0),
  }), { reach: 0, saved: 0, shares: 0, interactions: 0 });
  const top = ranked[0];
  const topMeta = top.post.contentMetadata || {};

  return [
    '📊 *오늘경제 주간 성장 리포트*',
    `게시물 ${ranked.length}개 · 누적 도달 ${totals.reach.toLocaleString()} · 저장 ${totals.saved.toLocaleString()} · 공유 ${totals.shares.toLocaleString()}`,
    '',
    `🏆 *반응 1위*: <${top.post.permalink}|${top.post.articleTitle}>`,
    `참여율 ${top.metrics.engagementRate || 0}% · 주제 ${topMeta.topic || '미분류'} · 훅 ${topMeta.hook_type || '미분류'}`,
    '',
    '다음 주 운영: 1위 게시물의 주제·훅 조합을 한 번 더 실험하고, 저장과 공유가 낮은 조합은 줄입니다.',
  ].join('\n');
}

function kstWeekKey(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600000);
  const day = kst.getUTCDay();
  const monday = new Date(kst);
  monday.setUTCDate(kst.getUTCDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

async function collectInsights({ now = new Date(), fetchImpl = fetch } = {}) {
  const instagramToken = resolveInstagramToken();
  const posts = loadPosts();
  const collected = [];

  for (const post of posts) {
    for (const window of dueWindows(post, now)) {
      const metrics = await getMediaInsights({
        mediaId: post.mediaId,
        token: instagramToken,
        version: config.instagramApiVersion,
        fetchImpl,
      });
      post.metrics ||= {};
      post.metrics[window.label] = {
        ...metrics,
        engagementRate: calculateEngagementRate(metrics),
        collectedAt: now.toISOString(),
      };
      collected.push({ post, window: window.label, metrics: post.metrics[window.label] });
    }
  }

  if (collected.length > 0) {
    savePosts(posts);
    const lines = collected.map(({ post, window, metrics }) =>
      `• ${window} · <${post.permalink}|${post.articleTitle}> · 도달 ${metrics.reach || 0} · 저장 ${metrics.saved || 0} · 공유 ${metrics.shares || 0} · 참여율 ${metrics.engagementRate}%`
    );
    await sendAnalyticsReport(`📈 *Instagram 성과 스냅샷*\n${lines.join('\n')}`);
  }

  const kst = new Date(now.getTime() + 9 * 3600000);
  const state = loadState();
  const weekKey = kstWeekKey(now);
  if (kst.getUTCDay() === 1 && !(state.weeklyReports || []).includes(weekKey)) {
    await sendAnalyticsReport(buildWeeklyReport(posts, now));
    state.weeklyReports = [...(state.weeklyReports || []), weekKey].slice(-12);
    saveState(state);
  }

  return collected;
}

if (require.main === module) {
  collectInsights().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  buildWeeklyReport,
  collectInsights,
  dueWindows,
  kstWeekKey,
  latestMetrics,
};
