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
