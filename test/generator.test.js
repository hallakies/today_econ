const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFallbackEditorial, ensureSingleHighlight, finalizeCaption, normalizeActionStep, normalizeActionSteps, normalizeGeneratedContent, parseJsonResponse } = require('../src/generator');
const { evaluateContentQuality } = require('../src/quality');

test('preserves useful caption paragraphs and replaces generated hashtags', () => {
  const caption = finalizeCaption('훅입니다.\n\n핵심 설명입니다.\n\n어떻게 보세요?\n\n#임시태그');
  assert.match(caption, /훅입니다\.\n\n핵심/);
  assert.doesNotMatch(caption, /임시태그/);
  assert.match(caption, /#today\.econ/);
});

test('parses JSON wrapped in a markdown fence', () => {
  assert.deepEqual(parseJsonResponse('```json\n{"ok":true}\n```'), { ok: true });
});

test('repairs missing or duplicated bullet highlights without changing the claim', () => {
  assert.equal(ensureSingleHighlight('당국은 스톡론 한도를 10억원으로 제한해요.'), '당국은 스톡론 한도를 <hl>10억원</hl>으로 제한해요.');
  assert.equal(ensureSingleHighlight('<hl>대출</hl> 조건을 <hl>다시</hl> 확인해요.'), '<hl>대출 조건을</hl> 다시 확인해요.');
});

test('normalizes generated card sections and bullet markup', () => {
  const content = normalizeGeneratedContent({
    card1: { title: '대출 한도 변화', subtitle: '내 조건부터 확인해요' },
    card2: { section_title: '무슨 일이야?', bullets: ['대출 한도 축소'] },
    card3: { section_title: '그래서?', bullets: ['내 한도를 확인해요'] },
    card4: { section_title: '결론', bullets: ['은행 조건을 비교해요'] },
  }, '캡션입니다. 질문이 있나요?', { pubDate: '2026-07-16T00:00:00Z' });
  assert.equal(content.card2.section_title, '무슨 일이야?');
  assert.equal(content.card3.section_title, '그래서 내 돈은?');
  assert.equal(content.card4.section_title, '앞으로 이렇게 될 수도');
  assert.match(content.card2.bullets[0], /<hl>.*<\/hl>/);
});

test('repairs incomplete action steps and builds a usable caption', () => {
  assert.equal(normalizeActionStep('대출 문턱과 을 비교한다.', 1), '대출 문턱과 조건을 비교하세요.');
  const content = normalizeGeneratedContent({
    card1: { title: '스톡론 한도 변화', subtitle: '내 대출 조건부터 확인해요' },
    core_insight: '한도 숫자와 적용 시점을 함께 봐야 해요.',
    card2: { bullets: ['신규 취급액은 <hl>30%</hl> 기준으로 관리돼요.', '1인 한도는 <hl>10억원</hl>으로 제한돼요.'] },
    card3: { bullets: ['이미 이용 중인 사람은 추가 한도를 확인해야 해요.', '신규 검토자는 금리와 조건을 비교해야 해요.'] },
    card4: { bullets: ['정책 적용 시점이 변수가 될 수 있어요.', '상품별 조건 차이는 남을 수 있어요.', '앱에서 한도를 확인하세요.'], action_steps: ['현재 이용 현황 확인', '대출 문턱과 을 비교한다.', '계약서와 약관을 확인한다'] },
  }, '', { pubDate: '2026-07-16T00:00:00Z', title: '스톡론 규제', link: 'https://example.com/stock-loan' });
  assert.match(content.instagram_caption, /①/);
  assert.doesNotMatch(content.instagram_caption, /문턱과\s*을/);
  assert.match(content.instagram_caption, /저장해둘 확인 순서/);
  assert.match(content.instagram_caption, /https:\/\/example\.com\/stock-loan/);
});

test('fills a missing action step with a concrete, saveable check', () => {
  const steps = normalizeActionSteps(['앱에서 한도 확인', '', '']);
  assert.equal(steps.length, 3);
  assert.match(steps[1], /약관|시행일/);
  assert.match(steps[2], /금리|수수료/);
});

test('drops malformed or unsourced optional stats without weakening required facts', () => {
  const content = normalizeGeneratedContent({
    card1: { title: '상호금융 대출 28조 감소', subtitle: '내 대출 창구가 좁아질 수 있어요' },
    card2: {
      bullets: ['상호금융 가계대출 잔액이 <hl>28조원</hl> 줄었어요.', '은행권 대출은 <hl>114조원</hl> 늘었어요.'],
      stats: [{}, { value: '999억원', label: '근거 없는 수치' }],
    },
    card3: { bullets: ['대출을 알아보는 사람은 <hl>한도와 금리</hl>를 함께 확인해야 해요.', '중저신용자는 <hl>대체 상품</hl>의 비용을 비교해야 해요.'] },
    card4: { bullets: ['대출 창구가 더 좁아질 수 있어요.', '은행별 조건 차이가 남을 수 있어요.', '앱에서 내 한도를 확인해보세요.'], action_steps: ['앱에서 현재 한도를 확인하세요.', '약관에서 적용 기준을 확인하세요.', '금리와 수수료를 비교하세요.'] },
  }, '', {
    title: '상호금융 가계대출 28조 감소',
    fullText: '상호금융 가계대출은 28조원 줄었고 은행권 대출은 114조원 늘었다.',
    link: 'https://example.com/mutual-finance',
    pubDate: '2026-07-16T00:00:00Z',
  });
  assert.deepEqual(content.card2.stats, []);
  assert.doesNotMatch(content.instagram_caption, /999억원/);
  assert.match(content.instagram_caption, /28조원/);
});

test('removes a duplicated insight label before building the caption', () => {
  const content = normalizeGeneratedContent({
    core_insight: '오늘경제 한 줄 생각: 대출 조건부터 확인해야 해요.',
    card1: { title: '대출 조건 변화', subtitle: '내 돈의 선택지가 달라질 수 있어요' },
    card2: { bullets: ['대출 한도가 <hl>줄어들 수 있어요</hl>.', '은행별 기준이 <hl>달라질 수 있어요</hl>.'] },
    card3: { bullets: ['신청 전 <hl>상환액</hl>을 계산해야 해요.', '조건별 <hl>비용</hl>을 비교해야 해요.'] },
    card4: { bullets: ['심사 기준이 달라질 수 있어요.', '추가 서류가 필요할 수 있어요.', '앱에서 한도를 확인해보세요.'], action_steps: ['앱에서 한도를 확인하세요.', '약관에서 시행일을 확인하세요.', '금리를 비교하세요.'] },
  }, '', { title: '대출 조건 변화', fullText: '대출 한도와 금리 변화 기사', link: 'https://example.com/loan', pubDate: '2026-07-16T00:00:00Z' });
  assert.equal(content.core_insight, '대출 조건부터 확인해야 해요.');
  assert.equal((content.instagram_caption.match(/오늘경제 한 줄 생각/g) || []).length, 1);
});

test('self-heals the structural defects that previously stopped a publish run', () => {
  const selectedNews = {
    title: '노란우산 한도 연 1800만원으로 확대',
    fullText: '이달부터 자영업자 노란우산공제의 연간 납입 한도가 1200만원에서 1800만원으로 확대된다. 가입자는 사업 소득과 납입 여력을 확인해야 한다.',
    link: 'https://example.com/yellow-umbrella',
    pubDate: '2026-07-17T00:00:00Z',
  };
  const content = normalizeGeneratedContent({
    core_insight: '자영업자의 노후 준비 선택지가 넓어질 수 있어요.',
    card1: { title: '노란우산 한도 연 1800만원', subtitle: '자영업자의 노후 준비 지원' },
    card2: { bullets: ['연간 납입 한도가 1200만원에서 1800만원으로 확대되었습니다', '이달부터 확대된 한도를 적용합니다'] },
    card3: { bullets: ['자영업자는 노후 준비 자금을 더 나눠 관리할 수 있습니다.', '가입 중인 사람은 추가 납입 여력을 확인해볼 수 있습니다.'] },
    card4: {
      bullets: ['가입 중인 사람은 추가 납입 여력을 확인해볼 수 있습니다.', '제도 활용 폭은 사업 소득에 따라 달라질 수 있습니다.', '앱에서 납입 한도를 확인하세요.'],
      action_steps: ['현재 납입액 확인', '가입 조건 확인', ''],
    },
    analysis: { money_channel: 'credit', effective_date: '2026년 7월', money_effect: '자영업자 노후 준비 지원' },
  }, '', selectedNews);

  assert.equal(content.analysis.effective_date, '');
  assert.match(content.card2.bullets[0], /(?:니다|요|다|[.!?])$/);
  assert.notEqual(content.card4.bullets[0], content.card3.bullets[1]);
  assert.equal(content.card4.action_steps.length, 3);
  const report = evaluateContentQuality(content, `${selectedNews.title} ${selectedNews.fullText}`);
  assert.equal(report.passed, true, JSON.stringify(report));
});

test('builds a grounded safe fallback instead of ending the run with an unusable draft', () => {
  const selectedNews = {
    title: '노란우산 한도 연 1800만원으로 확대',
    fullText: '이달부터 자영업자 노란우산공제의 연간 납입 한도가 1200만원에서 1800만원으로 확대된다. 가입자는 사업 소득과 납입 여력을 확인해야 한다.',
    link: 'https://example.com/yellow-umbrella',
    pubDate: '2026-07-17T00:00:00Z',
  };
  const fallbackRaw = buildFallbackEditorial(selectedNews);
  const content = normalizeGeneratedContent({ ...fallbackRaw.cards, analysis: fallbackRaw.analysis }, '', selectedNews);
  const report = evaluateContentQuality(content, `${selectedNews.title} ${selectedNews.fullText}`);
  assert.equal(report.passed, true, JSON.stringify(report));
  assert.equal(content.card4.action_steps.length, 3);
  assert.match(content.instagram_caption, /저장해둘 확인 순서/);
});
