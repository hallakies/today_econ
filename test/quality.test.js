const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateContentQuality } = require('../src/quality');

function validContent() {
  return {
    card1: { title: '대출 한도, 내 집 계획이 바뀐다', subtitle: '실수요자라면 지금 볼 이유' },
    card2: {
      section_title: '무슨 일이 바뀌나',
      bullets: [
        '은행권은 <hl>주택담보대출 한도</hl>를 줄이는 방안을 검토하고 있어요.',
        '무주택 실수요자의 <hl>자금 조달 부담</hl>이 이전보다 커질 수 있어요.',
      ],
      stats: [{ value: '1조 7억원', label: '기타담보대출 잔액', comparison: '지난해 4018억원 대비 2.5배' }],
      hard_terms: [],
    },
    card3: {
      section_title: '누가 먼저 체감하나',
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
      policy_points: ['1인 한도와 월 신규 취급액 제한'],
      action_steps: ['앱에서 현재 한도 확인', '약관에서 시행일 확인', '추가 대출 전 비용 비교'],
      hard_terms: [],
    },
    instagram_caption: '대출 규제가 바뀌면 집값보다 먼저 바뀌는 건 내가 빌릴 수 있는 돈이에요.\n\n기사 기준 기타담보대출 잔액과 한도 변화가 함께 나타났어요. 다만 실제 적용은 상품과 시점에 따라 달라질 수 있어요.\n\n오늘경제의 한 줄 해석: 같은 기사라도 이용 중인 사람과 신규 검토자의 확인 순서는 달라야 해요.\n\n① 앱에서 현재 한도 확인 ② 약관에서 시행일 확인 ③ 추가 대출 전 비용 비교\n\n현재 상태를 이용 중/검토 중/관심 없음 중 골라 댓글로 알려주세요. 저장하고 필요한 분께 공유해 주세요.',
  };
}

test('passes a differentiated, saveable four-card story', () => {
  const report = evaluateContentQuality(validContent(), '주택담보대출 한도 축소와 기타담보대출 잔액 1조7억원, 지난해 4018억원 대비 2.5배를 다룬 기사');
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
