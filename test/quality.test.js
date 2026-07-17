const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateContentQuality } = require('../src/quality');

function validContent() {
  return {
    card1: { title: '대출 한도, 내 집 계획이 바뀐다', subtitle: '실수요자라면 지금 볼 이유' },
    card2: {
      section_title: '무슨 일이야?',
      bullets: [
        '은행권은 <hl>주택담보대출 한도</hl>를 줄이는 방안을 검토하고 있어요.',
        '무주택 실수요자의 <hl>자금 조달 부담</hl>이 이전보다 커질 수 있어요.',
      ],
      stats: [{ value: '1조 7억원', label: '기타담보대출 잔액', comparison: '지난해 4018억원 대비 2.5배' }],
      hard_terms: [],
    },
    card3: {
      section_title: '그래서 내 돈은?',
      bullets: [
        '대출을 준비 중이라면 <hl>내 한도와 월 상환액</hl>을 다시 계산해야 해요.',
        '현금 비중이 높다면 <hl>매수 시점보다 조건</hl>을 먼저 비교하는 편이 나아요.',
      ],
      hard_terms: [],
    },
    card4: {
      section_title: '앞으로 이렇게 될 수도',
      bullets: [
        '실수요자 보완책이 나오는지가 <hl>대출 수요의 변수</hl>가 될 전망이에요.',
        '은행별 운영 기준이 달라질 수 있어 <hl>현장 한도 차이</hl>는 남을 수 있어요.',
        '은행 앱에서 <hl>내 대출 조건</hl>과 월 상환액을 직접 비교해보세요.',
      ],
      policy_points: ['1인 한도와 월 신규 취급액 제한'],
      action_steps: ['앱에서 현재 한도와 잔액을 확인하세요.', '약관에서 시행일과 적용 기준을 확인하세요.', '추가 대출 전 금리와 수수료를 비교하세요.'],
      hard_terms: [],
    },
    analysis: { money_channel: 'credit', money_effect: '대출 한도가 줄어들 가능성이 있어요.' },
    instagram_caption: '대출 규제가 바뀌면 집값보다 먼저 바뀌는 건 내가 빌릴 수 있는 돈이에요.\n\n무슨 일이야?\n기사 기준 기타담보대출 잔액과 한도 변화가 함께 나타났어요. 다만 실제 적용은 상품과 시점에 따라 달라질 수 있어요.\n\n그래서 내 돈은?\n대출을 준비 중인 사람은 승인액이 달라질 수 있어요.\n\n오늘경제 한 줄 생각\n같은 기사라도 이용 중인 사람과 신규 검토자의 확인 순서는 달라야 해요.\n\n앞으로 이렇게 될 수도\n은행별 조건 차이가 남을 수 있어요.\n\n① 앱에서 현재 한도 확인 ② 약관에서 시행일 확인 ③ 추가 대출 전 비용 비교\n\n저장해둘 확인 순서를 정리했어요. 필요한 분께 공유하고, 현재 상태도 알려주세요?\n\n🔗 원문 기사\nhttps://example.com/article',
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

test('blocks invisible placeholder text and old AI section wording', () => {
  const content = validContent();
  content.card4.bullets[2] = '은행 앱에서 <hl>undefined</hl> 조건을 확인해보세요.';
  content.card2.section_title = '확인된 사실';
  const report = evaluateContentQuality(content, '주택담보대출 한도와 기타담보대출 잔액을 다룬 기사');
  assert.equal(report.passed, false);
  assert.match(report.errors.join(' '), /undefined|section_title/);
});

test('blocks an actual missing value inside rendered metadata', () => {
  const content = validContent();
  content.card2.policy_points = [undefined];
  const report = evaluateContentQuality(content, '주택담보대출 한도와 기타담보대출 잔액을 다룬 기사');
  assert.equal(report.passed, false);
  assert.match(report.errors.join(' '), /missing value/);
});

test('requires an effective date claim to be sourced', () => {
  const content = validContent();
  content.analysis.effective_date = '2026년 8월 1일 시행';
  const report = evaluateContentQuality(content, '주택담보대출 한도와 기타담보대출 잔액을 다룬 기사');
  assert.equal(report.passed, false);
  assert.match(report.errors.join(' '), /effective_date/);
});

test('accepts natural Korean conditional forecast wording', () => {
  const content = validContent();
  content.card4.bullets[0] = '규제가 장기화될 경우 <hl>대출 창구</hl>가 더 좁아질 수 있어요.';
  content.card4.bullets[1] = '은행별 심사 기준은 <hl>달라질 수 있어요</hl>.';
  const report = evaluateContentQuality(content, '주택담보대출 한도 축소와 기타담보대출 잔액 1조7억원, 지난해 4018억원 대비 2.5배를 다룬 기사');
  assert.equal(report.passed, true, JSON.stringify(report));
});

test('blocks contradictory percentages and transformed source numbers before publishing', () => {
  const content = validContent();
  content.card2.bullets[0] = '60대 이상 취약차주 비중은 <hl>2021년 15%에서 2022년 19%</hl>로 높아졌어요.';
  content.card2.bullets[1] = '60대 이상 연체율은 <hl>1.4%에서 1.4%로 두 배</hl> 뛰었어요.';
  content.card3.bullets[1] = '고령 자영업자의 평균 대출은 <hl>1억원</hl>으로 30대보다 두 배 많아질 수 있어요.';
  const source = '60대 이상 취약차주 비중은 2021년 15%에서 2022년 19%로 높아졌다. 고령 자영업자의 1인당 평균 대출 규모는 3억9000만원이다.';
  const report = evaluateContentQuality(content, source);
  assert.equal(report.passed, false);
  assert.match(report.errors.join(' '), /contradictory|do not appear together|not grounded/);
});

test('requires a concrete reader hook and three distinct money checks', () => {
  const content = validContent();
  content.card1 = { title: '금리 인상 후 고령층 타격', subtitle: '60대 이상 취약차주 비중 변화' };
  content.card4.action_steps = [
    '앱에서 대출 상태를 확인하세요.',
    '계약서를 확인해서 대출 상태를 확인하세요.',
    '약관을 확인해서 대출 상태를 확인하세요.',
  ];
  content.analysis.uncertainty = '정확히 예측할 수 없어요.';
  const report = evaluateContentQuality(content, '금리 인상과 고령층 가계대출, 대출 한도와 금리 조건을 다룬 기사');
  assert.equal(report.passed, false);
  assert.match(report.errors.join(' '), /cover must name|concrete money check|repeat the same vague|uncertainty/);
});
