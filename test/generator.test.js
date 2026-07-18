const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildFallbackEditorial,
  buildReelCaption,
  ensureSingleHighlight,
  finalizeCaption,
  normalizeGeneratedContent,
  parseJsonResponse,
} = require('../src/generator');
const { evaluateContentQuality } = require('../src/quality');

const housingNews = {
  title: '이젠 정말 ‘헛꿈’ 안 꾼다”…한 달 새 청약통장 10만명 깬 이유는?',
  fullText: '청약통장 가입자는 한 달 새 10만명 감소했다. 분양가 상승과 낮은 당첨 가능성 때문에 청약통장을 해지하는 가입자가 늘었다.',
  pubDate: '2026-07-17T00:00:00Z',
};

test('keeps one valid hashtag set and strips URLs and generated tags', () => {
  const caption = finalizeCaption('훅입니다.\n\n핵심 설명입니다.\n\nhttps://example.com\n\n#임시태그 #today.econ');
  assert.doesNotMatch(caption, /https?:|임시태그|#today\.econ/);
  assert.equal((caption.match(/#today_econ/g) || []).length, 1);
});

test('builds a shorter Reel caption while preserving the canonical hashtag set', () => {
  const caption = buildReelCaption({
    card1: { title: '고령층 연체율 4년 새 2배', subtitle: '부모님 대출의 월 이자를 확인할 때예요' },
    core_insight: '대출 뉴스는 내 월 상환액이 얼마나 달라지는지를 먼저 봐야 해요.',
  });
  assert.match(caption, /고령층 연체율 4년 새 2배/);
  assert.match(caption, /핵심 숫자는 영상에서 확인/);
  assert.equal((caption.match(/#today_econ/g) || []).length, 1);
  assert.ok(caption.length < 400);
});

test('parses JSON wrapped in a markdown fence', () => {
  assert.deepEqual(parseJsonResponse('```json\n{"ok":true}\n```'), { ok: true });
});

test('repairs missing or duplicated bullet highlights without changing the claim', () => {
  assert.equal(ensureSingleHighlight('당국은 스톡론 한도를 10억원으로 제한해요.'), '당국은 스톡론 한도를 <hl>10억원</hl>으로 제한해요.');
  assert.equal(ensureSingleHighlight('<hl>대출</hl> 조건을 <hl>다시</hl> 확인해요.'), '<hl>대출 조건을</hl> 다시 확인해요.');
});

test('normalizes to a three-card story and removes a generated fourth card', () => {
  const content = normalizeGeneratedContent({
    card1: { title: '청약통장 10만...', subtitle: '청약 계획을 다시 확인해요' },
    card2: { bullets: ['청약통장 가입자가 10만명 감소했어요.', '분양가 상승으로 해지가 늘었어요.'] },
    card3: { bullets: ['청약 계획을 다시 비교해보세요.', '납입 부담도 함께 계산해보세요.'] },
    card4: { bullets: ['쓰지 않는 카드예요.'] },
  }, '', housingNews);
  assert.equal(content.card2.section_title, '무슨 일이야?');
  assert.equal(content.card3.section_title, '그래서 내 돈은?');
  assert.equal(content.card3.bullets.length, 3);
  assert.equal(content.card4, undefined);
  assert.equal(content.card1.title, '청약통장,\n한 달 새 10만 명 해지');
  assert.equal(content.analysis.hook_candidates.length, 5);
  assert.equal(content.analysis.selected_hook, content.card1.title);
  assert.equal(content.analysis.strongest_fact, '청약통장 가입자는 한 달 새 10만명 감소했다.');
});

test('drops malformed optional stats and removes the source URL from Instagram copy', () => {
  const content = normalizeGeneratedContent({
    card1: { subtitle: '청약 계획을 다시 확인해요' },
    card2: {
      bullets: ['청약통장 가입자가 <hl>10만명</hl> 감소했어요.', '분양가 상승으로 <hl>해지</hl>가 늘었어요.'],
      stats: [{ value: '999억원', label: '근거 없는 수치' }],
    },
    card3: { bullets: ['청약 계획을 <hl>다시 비교</hl>해보세요.', '월 납입 부담을 <hl>함께 계산</hl>해보세요.', '은행 앱에서 <hl>납입 횟수와 인정 금액</hl>을 확인하세요.'] },
  }, '', { ...housingNews, link: 'https://example.com/housing' });
  assert.deepEqual(content.card2.stats, []);
  assert.doesNotMatch(content.instagram_caption, /999억원|https?:\/\//);
  assert.equal((content.instagram_caption.match(/#today_econ/g) || []).length, 1);
});

test('polluted article fallback excludes byline and stays on the housing topic', () => {
  const selectedNews = {
    ...housingNews,
    fullText: `류영상 기자 입력 : 2026.07.17 21:56 구글 검색 선호 추가 알아보기 Google 검색에서 매일경제 기사를 더 자주 볼 수 있습니다.
      청약통장 가입자는 한 달 새 10만명 감소했다. 분양가 상승과 낮은 당첨 가능성 때문에 청약통장을 해지하는 가입자가 늘었다.
      관련 기사에서는 자영업자 노후 준비와 대출을 소개했다.`,
  };
  const fallbackRaw = buildFallbackEditorial(selectedNews);
  const content = normalizeGeneratedContent({ ...fallbackRaw.cards, analysis: fallbackRaw.analysis }, '', selectedNews);
  const visible = JSON.stringify(content);
  assert.doesNotMatch(visible, /류영상|기자 입력|Google 검색|자영업자|노후 준비|대출 앱/);
  assert.equal(content.analysis.money_channel, 'housing');
  assert.equal(content.card4, undefined);
  assert.equal(content.analysis.strongest_fact, '청약통장 가입자는 한 달 새 10만명 감소했다.');
  assert.deepEqual(content.analysis.material_numbers.slice(0, 1), ['10만명']);
  assert.equal(content.analysis.hook_candidates.length, 5);
  assert.doesNotMatch(content.card3.bullets.slice(0, 2).join(' '), /확인하세요|비교하세요/);
  assert.match(content.card3.bullets[2], /확인하세요/);
  const report = evaluateContentQuality(content, `${selectedNews.title} ${selectedNews.fullText}`);
  assert.equal(report.passed, true, JSON.stringify(report));
  assert.equal(report.gates.brand_promise.passed, true, JSON.stringify(report.gates.brand_promise));
  assert.equal(report.gates.readability.passed, true, JSON.stringify(report.gates.readability));
});

test('rejects fallback when two clean topic facts cannot be found', () => {
  assert.throws(
    () => buildFallbackEditorial({ title: '청약 소식', fullText: '류영상 기자 입력 : 2026.07.17 21:56 Google 검색 선호 추가' }),
    error => error.code === 'ARTICLE_REJECTED'
  );
});
