const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureSingleHighlight, finalizeCaption, normalizeActionStep, normalizeGeneratedContent, parseJsonResponse } = require('../src/generator');

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
