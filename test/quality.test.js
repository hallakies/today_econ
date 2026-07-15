const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateContentQuality } = require('../src/quality');

function validContent() {
  return {
    card1: { title: '대출 한도, 내 집 계획이 바뀐다', subtitle: '실수요자라면 지금 볼 이유' },
    card2: {
      section_title: '숫자로 보는 핵심',
      bullets: [
        '은행권은 <hl>주택담보대출 한도</hl>를 줄이는 방안을 검토하고 있어요.',
        '무주택 실수요자의 <hl>자금 조달 부담</hl>이 이전보다 커질 수 있어요.',
      ],
      hard_terms: [],
    },
    card3: {
      section_title: '내 돈에는 이렇게',
      bullets: [
        '대출을 준비 중이라면 <hl>내 한도와 월 상환액</hl>을 다시 계산해야 해요.',
        '현금 비중이 높다면 <hl>매수 시점보다 조건</hl>을 먼저 비교하는 편이 나아요.',
      ],
      hard_terms: [],
    },
    card4: {
      section_title: '오늘 확인할 것',
      bullets: [
        '실수요자 보완책이 나오는지가 <hl>대출 수요의 변수</hl>가 될 전망이에요.',
        '은행별 운영 기준이 달라질 수 있어 <hl>현장 한도 차이</hl>는 남을 수 있어요.',
        '은행 앱에서 <hl>내 대출 조건</hl>과 월 상환액을 직접 비교해보세요.',
      ],
      hard_terms: [],
    },
    instagram_caption: '대출 규제가 바뀌면 집값보다 먼저 바뀌는 건 내가 빌릴 수 있는 돈이에요.\n\n같은 소득이어도 은행과 시점에 따라 한도가 달라질 수 있어요. 그래서 계약금을 넣기 전에 한도를 먼저 확인해야 해요.\n\n지금 주택 대출을 준비하고 있나요? 가장 궁금한 조건을 댓글로 남겨주세요.',
  };
}

test('passes a differentiated, saveable four-card story', () => {
  const report = evaluateContentQuality(validContent(), '주탹담보대출 한도 축소와 무주택자 실수요자 자금 조달 부담을 다룬 기사');
  assert.equal(report.passed, true, JSON.stringify(report));
  assert.ok(report.score >= 80);
});

test('blocks a numeric claim that is absent from the article', () => {
  const content = validContent();
  content.card2.bullets[0] = '기사에 없는 <hl>37% 한도 축소</hl>가 확정됐다고 설명해요.';
  const report = evaluateContentQuality(content, '대출 한도를 조정한다는 내용');
  assert.equal(report.passed, false);
  assert.match(report.errors.join(' '), /37%/);
});
