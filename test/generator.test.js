const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureSingleHighlight, finalizeCaption, normalizeGeneratedContent, parseJsonResponse } = require('../src/generator');

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
  assert.equal(content.card2.section_title, '숫자로 보는 핵심');
  assert.equal(content.card3.section_title, '내 돈에는 이렇게');
  assert.equal(content.card4.section_title, '오늘 확인할 것');
  assert.match(content.card2.bullets[0], /<hl>.*<\/hl>/);
});
