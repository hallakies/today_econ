const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildArticleBrief,
  buildHookCandidates,
  extractFactRecords,
  extractMaterialNumbers,
  selectEditorialHook,
} = require('../src/article');

const title = '이젠 정말 ‘헛꿈’ 안 꾼다”…한 달 새 청약통장 10만명 깬 이유는?';
const body = [
  '류영상 기자 입력 : 2026.07.17 21:56 구글 검색 선호 추가 알아보기.',
  '청약통장 가입자는 한 달 새 10만명 감소했다.',
  '분양가 상승과 낮은 당첨 가능성 때문에 청약통장을 해지하는 가입자가 늘었다.',
  '관련 기사에서는 자영업자 노후 준비와 대출을 소개했다.',
].join(' ');

test('ranks the strongest clean fact and preserves its material number', () => {
  const records = extractFactRecords(title, body);
  assert.equal(records[0].text, '청약통장 가입자는 한 달 새 10만명 감소했다.');
  assert.deepEqual(records[0].material_numbers.map(number => number.normalized), ['10만명']);
  assert.ok(records[0].score > records[1].score);
  assert.doesNotMatch(JSON.stringify(records), /류영상|Google 검색/);
});

test('extracts structured material numbers with their original display value', () => {
  assert.deepEqual(
    extractMaterialNumbers('잔액은 3억9000만원이고 비중은 19%로 높아졌다.').map(number => number),
    [
      { raw: '3억9000만원', normalized: '3억9000만원' },
      { raw: '19%', normalized: '19%' },
    ]
  );
});

test('creates five hook candidates and deterministically selects the same winner', () => {
  const factRecords = extractFactRecords(title, body);
  const candidates = buildHookCandidates({
    title,
    topic: 'housing',
    audience: '주택을 준비하는 사람',
    factRecords,
  });
  assert.equal(candidates.length, 5);
  const selectedOnce = selectEditorialHook(candidates);
  const selectedTwice = selectEditorialHook([...candidates].reverse());
  assert.equal(selectedOnce.text, '청약통장,\n한 달 새 10만 명 해지');
  assert.equal(selectedTwice.text, selectedOnce.text);
  assert.doesNotMatch(selectedOnce.text, /…|\.{3}/);
});

test('prefers the strongest fact hook when the headline number is weaker', () => {
  const brief = buildArticleBrief({
    title: '청약통장 10만명 감소, 분양가 80% 급등',
    fullText: [
      '청약통장 가입자는 한 달 새 10만명 감소했다.',
      '서울 분양가는 5년간 80% 올랐고 청약통장 해지가 늘었다.',
    ].join(' '),
  });
  assert.match(brief.strongest_fact, /80%/);
  assert.match(brief.cover_title, /80%|5년/);
});

test('brief locks facts, material numbers, topic, and selected hook before generation', () => {
  const brief = buildArticleBrief({ title, fullText: body });
  assert.equal(brief.topic, 'housing');
  assert.equal(brief.money_channel, 'housing');
  assert.equal(brief.strongest_fact, '청약통장 가입자는 한 달 새 10만명 감소했다.');
  assert.equal(brief.material_numbers[0].normalized, '10만명');
  assert.equal(brief.hook_candidates.length, 5);
  assert.equal(brief.selected_hook.text, brief.cover_title);
  assert.doesNotMatch(JSON.stringify(brief.facts), /자영업자|노후 준비|기자 입력|Google/);
});

test('builds a clean pension-insurance brief from an article polluted by photo captions', () => {
  const brief = buildArticleBrief({
    title: '“지금 안 하면 늦는다”…노후 불안 확산에 청년들 이례적으로 몰린 ‘이것’',
    fullText: [
      '연금보험, 20대 이하 증가율 97.5% 달해 해당 기사 내용과는 무관함.',
      '기사 이해를 돕기 위한 사진임. [연합뉴스] 사진 확대.',
      '올 상반기 20대 청년층과 5060 고령층을 중심으로 연금보험 가입이 급증한 것으로 나타났다.',
      '증시 호황에 따른 변액보험의 인기와 노후 생활고에 대한 불안감이 맞물린 결과다.',
      '올해 상반기 연금보험 신계약 건수는 전년 동기 대비 78.1% 급증했다.',
      '60대 이상은 135.3%, 20대 이하는 97.5%의 증가율을 보였다.',
    ].join(' '),
  });

  assert.equal(brief.topic, 'pension_insurance');
  assert.equal(brief.money_channel, 'mixed');
  assert.equal(brief.event_type, 'market_trend');
  assert.match(brief.audience, /20대|5060/);
  assert.match(brief.strongest_fact, /연금보험|20대/);
  assert.match(brief.cover_title, /연금보험/);
  assert.match(brief.cover_title, /급증/);
  assert.doesNotMatch(brief.cover_title, /97\.5%\s*변화|핵심 변화/);
  assert.doesNotMatch(JSON.stringify(brief), /기사 내용과는 무관|연합뉴스|사진 확대|자영업자|공제 한도/);
});

test('uses the RSS summary to supplement a sparse fetched article body', () => {
  const brief = buildArticleBrief({
    title: '노후 불안에 청년들이 몰린 연금보험',
    fullText: '올 상반기 연금보험 가입이 급증한 것으로 나타났다.',
    summary: '연금보험 신계약은 전년 동기 대비 78.1% 늘었다. 20대 이하 가입 증가율은 97.5%였다.',
  });

  assert.equal(brief.topic, 'pension_insurance');
  assert.ok(brief.facts.length >= 2);
  assert.match(brief.facts.join(' '), /78\.1%/);
  assert.match(brief.facts.join(' '), /97\.5%/);
});

test('keeps pension-insurance facts ahead of other insurance products in the same article', () => {
  const brief = buildArticleBrief({
    title: '노후 불안에 청년들이 몰린 연금보험',
    fullText: [
      '연금보험 신계약 건수는 전년 동기 대비 78.1% 급증했다.',
      '특히 20대 이하의 연금보험 가입 증가율은 97.5%에 달했다.',
      '건강보험과 간편보험 신계약은 각각 16.5%, 44.5% 증가했다.',
      '펫보험 신계약도 전년 동기 대비 80% 급증했다.',
    ].join(' '),
  });

  const leadFacts = brief.facts.slice(0, 2).join(' ');
  assert.match(leadFacts, /78\.1%/);
  assert.match(leadFacts, /97\.5%/);
  assert.doesNotMatch(leadFacts, /건강보험|간편보험|펫보험/);
});
