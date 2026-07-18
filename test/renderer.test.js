const test = require('node:test');
const assert = require('node:assert/strict');
const { buildThemeHtml, canonicalCardLabel } = require('../src/templates');
const { validateSlideLayout } = require('../src/renderer');

const card = {
  title: '내 대출 한도가 바뀔 수 있어요',
  subtitle: '계약 전 내가 빌릴 수 있는 돈부터 확인해요',
  section_title: '무슨 일이야?',
  bullets: [
    '은행별 대출 운영 기준이 달라질 수 있어요.',
    '신청 시점에 따라 실제 한도가 달라질 수 있어요.',
  ],
  stats: [
    { value: '10억원', label: '1인 이용 한도', comparison: '기사 기준', baseline: '시행 시점' },
    { value: '30%', label: '월 신규 취급액', comparison: '전월 기준', baseline: '기사 기준' },
  ],
  hard_terms: [],
};

test('uses one canonical label for each rendered card role', () => {
  assert.equal(canonicalCardLabel('fact'), '무슨 일이야?');
  assert.equal(canonicalCardLabel('audience'), '그래서 내 돈은?');
  assert.equal(canonicalCardLabel('action'), '앞으로 이렇게 될 수도');

  const html = buildThemeHtml('unified', '#D7A84B', 'fact', card, '', '2026.7.18', '', '', 2, 4, '오늘의 돈 신호');
  assert.match(html, /data-card-type="fact"/);
  assert.match(html, />무슨 일이야\?</);
  assert.match(html, /data-stat-panel/g);
  assert.equal((html.match(/data-stat-panel/g) || []).length, 2);
});

test('action card renders one insight block, two impacts, and one action', () => {
  const action = {
    section_title: '앞으로 이렇게 될 수도',
    bullets: [
      '이미 이용 중인 사람은 추가 한도가 줄어들 수 있어요.',
      '신규 검토자는 심사 조건이 까다로워질 가능성이 있어요.',
      '오늘은 앱에서 내 한도와 잔액을 확인해보세요.',
    ],
  };
  const html = buildThemeHtml('unified', '#D7A84B', 'action', action, '', '2026.7.18', '', '내가 빌릴 수 있는 돈을 먼저 확인해요.', 4, 4, '오늘의 돈 신호');
  assert.match(html, /data-card-type="action"/);
  assert.match(html, /오늘경제 한 줄 생각/);
  assert.equal((html.match(/class="[^\"]*action-bullet action-bullet-/g) || []).length, 3);
  assert.doesNotMatch(html, /저장할 확인 순서/);
});

test('compact three-card action preserves the reader-impact badge', () => {
  const html = buildThemeHtml('unified', '#D7A84B', 'action', {
    section_title: '그래서 내 돈은?',
    bullets: ['이미 이용 중인 사람은 추가 한도가 줄 수 있어요.', '신규 검토자는 조건이 달라질 수 있어요.', '앱에서 내 한도를 확인해보세요.'],
  }, '', '2026.7.18', '', '내 돈의 변화를 먼저 확인해요.', 3, 3, '오늘의 돈 신호');
  assert.match(html, />그래서 내 돈은\?</);
  assert.doesNotMatch(html, />앞으로 이렇게 될 수도<\/span>/);
});

test('layout validator reports actionable cover, density, overflow, and placeholder failures', () => {
  const report = validateSlideLayout({
    cardType: 'title',
    titleLineCount: 3,
    subtitleLineCount: 2,
    boxOverflow: true,
    overflowNodes: ['cover-title'],
    rectOverflow: false,
    invalidText: false,
    emptyBulletCount: 0,
  }, 1);
  assert.equal(report.ok, false);
  assert.match(report.errors.join(' '), /title wraps to 3 lines/);
  assert.match(report.errors.join(' '), /subtitle wraps to 2 lines/);
  assert.match(report.errors.join(' '), /exceeds its box/);

  const actionReport = validateSlideLayout({
    cardType: 'action',
    coreInsightCount: 0,
    actionBulletCount: 2,
    boxOverflow: false,
    rectOverflow: false,
    invalidText: true,
    emptyBulletCount: 1,
  }, 4);
  assert.equal(actionReport.ok, false);
  assert.match(actionReport.errors.join(' '), /one compact/);
  assert.match(actionReport.errors.join(' '), /2 bullets/);
  assert.match(actionReport.errors.join(' '), /undefined\/null/);
  assert.match(actionReport.errors.join(' '), /empty/);
});
