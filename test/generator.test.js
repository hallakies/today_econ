const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildFallbackEditorial,
  buildReelCaption,
  ensureSingleHighlight,
  finalizeCaption,
  generateCardContent,
  isQuotaOrPayloadError,
  normalizeGeneratedContent,
  parseJsonResponse,
  shouldUseLlmEditorial,
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

test('uses the deterministic editorial path by default', () => {
  assert.equal(shouldUseLlmEditorial({}), false);
  assert.equal(shouldUseLlmEditorial({ USE_LLM_EDITORIAL: 'false' }), false);
  assert.equal(shouldUseLlmEditorial({ USE_LLM_EDITORIAL: 'true' }), true);
});

test('recognizes quota and payload failures that must not be retried', () => {
  assert.equal(isQuotaOrPayloadError({ status: 429, message: 'tokens per day limit reached' }), true);
  assert.equal(isQuotaOrPayloadError({ status: 413, message: 'request too large' }), true);
  assert.equal(isQuotaOrPayloadError({ status: 500, message: 'temporary server failure' }), false);
});

test('generates a publishable editorial without an LLM call', async () => {
  const original = process.env.USE_LLM_EDITORIAL;
  delete process.env.USE_LLM_EDITORIAL;
  try {
    const content = await generateCardContent(housingNews);
    assert.equal(content.quality_score, 100);
    assert.equal(content.content_metadata.editorial_format, 'money-change-brief-deterministic');
    assert.match(content.card1.title, /청약통장/);
  } finally {
    if (original === undefined) delete process.env.USE_LLM_EDITORIAL;
    else process.env.USE_LLM_EDITORIAL = original;
  }
});

test('turns a retirement-account bond tax story into a short concrete money brief', async () => {
  const content = await generateCardContent({
    title: "퇴직연금 계좌로 국채 사면 … 세금 '0원'도 가능",
    fullText: [
      '오는 9월부터 DC형과 IRP 등 퇴직연금 계좌에서 개인투자용 국채를 살 수 있다.',
      '만기까지 보유하면 이자소득 세금을 0원까지 낮출 수 있다.',
      '일반 계좌에서 사는 것보다 세 부담을 50% 이상 줄일 수 있다.',
    ].join(' '),
    pubDate: '2026-07-21T00:00:00Z',
  });

  assert.equal(content.quality_score, 100);
  assert.equal(content.analysis.topic, 'tax');
  assert.match(content.card1.title, /퇴직연금|국채/);
  assert.match(content.card1.title, /0원/);
  assert.doesNotMatch(content.card1.title, /핵심 변화|달라진 핵심/);
  assert.ok(content.card2.bullets.every(bullet => bullet.replace(/<\/?hl>/g, '').length <= 72));
  assert.doesNotMatch(content.card2.bullets.join(' '), /(?:를|은|는|이|가|개월)이에요/);
  assert.match(content.card3.bullets.join(' '), /세후 수익|이자소득 세금/);
});

test('keeps a business-loan article in credit and produces readable story-specific impacts', async () => {
  const content = await generateCardContent({
    title: '李 정부 포용금융 기조에 중소기업 대출금리 낮아져',
    fullText: [
      '5대 시중은행의 자영업자 신용대출 평균 금리는 5.288%, 중소기업은 4.94%로 집계됐다.',
      '반면 가계대출은 주택담보대출 7%대, 개인신용대출 8%대까지 올랐다.',
      '자영업자 대출 잔액은 연초보다 9349억원 늘어나는 데 그쳤다.',
    ].join(' '),
    pubDate: '2026-07-19T00:00:00Z',
  });

  assert.equal(content.quality_score, 100);
  assert.equal(content.analysis.topic, 'credit');
  assert.match(content.card1.title, /자영업자|중소기업/);
  assert.match(content.card1.title, /5\.288%|4\.94%/);
  assert.ok(content.card2.bullets.every(bullet => bullet.replace(/<\/?hl>/g, '').length <= 72));
  assert.doesNotMatch(content.card2.bullets.join(' '), /(?:를|은|는|이|가|개월)이에요/);
  assert.match(content.card3.bullets.join(' '), /자영업자|중소기업/);
});

test('treats rising deposit rates as savings rather than loan advice', async () => {
  const content = await generateCardContent({
    title: '오르는 은행 예금 금리 … 3%대 중반도 등장',
    fullText: [
      '신한S드림 정기예금 만기 1년 금리는 연 2.05%에서 2.30%로 높아진다.',
      '쏠편한 정기예금 만기 1년 금리는 연 2.9%에서 3.2%로 올랐다.',
      '5대 시중은행 정기예금 잔액은 965조2949억원으로 늘었다.',
    ].join(' '),
    pubDate: '2026-07-21T00:00:00Z',
  });

  assert.equal(content.quality_score, 100);
  assert.equal(content.analysis.topic, 'savings');
  assert.match(content.card1.title, /예금금리/);
  assert.match(content.card3.bullets.join(' '), /예금|만기|세후 이자/);
  assert.doesNotMatch(content.card3.bullets.join(' '), /대출 승인|월 상환/);
});

test('repairs missing or duplicated bullet highlights without changing the claim', () => {
  assert.equal(ensureSingleHighlight('당국은 스톡론 한도를 10억원으로 제한해요.'), '당국은 스톡론 한도를 <hl>10억원</hl>으로 제한해요.');
  assert.equal(ensureSingleHighlight('<hl>대출</hl> 조건을 <hl>다시</hl> 확인해요.'), '<hl>대출 조건을</hl> 다시 확인해요.');
  assert.equal(ensureSingleHighlight('60대 이상은 135.3%, 20대 이하는 97.5% 늘었어요.'), '60대 이상은 <hl>135.3%</hl>, 20대 이하는 97.5% 늘었어요.');
  assert.equal(ensureSingleHighlight('상품설명서에서 <hl>사업비와 중도해지 환급률</hl>을 확인하세요.'), '상품설명서에서 <hl>사업비와 중도해지 환급률</hl>을 확인하세요.');
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

test('locks pension-insurance cards to the article instead of self-employed pension copy', () => {
  const selectedNews = {
    title: '“지금 안 하면 늦는다”…노후 불안 확산에 청년들 이례적으로 몰린 ‘이것’',
    fullText: [
      '연금보험, 20대 이하 증가율 97.5% 달해 해당 기사 내용과는 무관함.',
      '기사 이해를 돕기 위한 사진임. [연합뉴스] 사진 확대.',
      '올 상반기 20대 청년층과 5060 고령층을 중심으로 연금보험 가입이 급증한 것으로 나타났다.',
      '증시 호황에 따른 변액보험의 인기와 노후 생활고에 대한 불안감이 맞물린 결과다.',
      '올해 상반기 연금보험 신계약 건수는 전년 동기 대비 78.1% 급증했다.',
      '60대 이상은 135.3%, 20대 이하는 97.5%의 증가율을 보였다.',
    ].join(' '),
    pubDate: '2026-07-17T13:36:00Z',
  };
  const fallbackRaw = buildFallbackEditorial(selectedNews);
  const content = normalizeGeneratedContent(
    { ...fallbackRaw.cards, analysis: fallbackRaw.analysis },
    '',
    selectedNews
  );
  const visible = JSON.stringify(content);

  assert.match(content.card1.title, /연금보험/);
  assert.match(content.card1.title, /급증/);
  assert.match(content.card2.bullets.join(' '), /78\.1%|97\.5%/);
  assert.match(content.card3.bullets[0], /수익.*보장/);
  assert.match(content.card3.bullets[1], /적립금|수익률/);
  assert.match(content.card3.bullets[2], /사업비|중도해지 환급률/);
  assert.match(content.card3.bullets[2], /<hl>사업비와 중도해지 환급률<\/hl>/);
  assert.doesNotMatch(visible, /기사 내용과는 무관|연합뉴스|사진 확대|자영업자|공제 한도|월별 납입 부담/);
});
