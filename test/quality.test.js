const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateContentQuality } = require('../src/quality');

function validContent() {
  return {
    card1: { title: '청약통장,\n한 달 새 10만명 해지', subtitle: '내 집 마련 계획을 다시 확인해요' },
    card2: {
      section_title: '무슨 일이야?',
      bullets: [
        '청약통장 가입자는 한 달 새 <hl>10만명</hl> 감소했어요.',
        '분양가 상승과 낮은 당첨 가능성 때문에 <hl>해지</hl>가 늘었어요.',
      ],
      stats: [],
      hard_terms: [],
    },
    card3: {
      section_title: '그래서 내 돈은?',
      bullets: [
        '청약을 유지 중인 사람은 해지 여부에 따라 <hl>가입 기간 활용</hl>이 달라질 수 있어요.',
        '집을 준비하는 사람은 분양가 상승으로 <hl>월 납입 판단</hl>이 더 복잡해질 수 있어요.',
        '은행 앱에서 <hl>납입 횟수와 인정 금액</hl>을 확인하세요.',
      ],
      hard_terms: [],
    },
    analysis: {
      topic: 'housing',
      money_channel: 'housing',
      event_type: 'reported_change',
      money_effect: '청약 계획과 납입 부담이 달라질 수 있어요.',
      uncertainty: '분양가와 당첨 가능성에 따라 판단이 달라질 수 있어요.',
      strongest_fact: '청약통장 가입자는 한 달 새 10만명 감소했다.',
      verified_facts: [
        '청약통장 가입자는 한 달 새 10만명 감소했다.',
        '분양가 상승과 낮은 당첨 가능성 때문에 청약통장을 해지하는 가입자가 늘었다.',
      ],
      hook_candidates: [
        '청약통장,\n한 달 새 10만명 해지',
        '청약통장 가입자 10만명 감소',
        '청약·주택,\n10만명가 만든 변화',
        '청약·주택,\n주택 준비자의 선택 변화',
        '청약·주택,\n지금 바뀐 핵심',
      ],
      selected_hook: '청약통장,\n한 달 새 10만명 해지',
    },
    instagram_caption: '청약통장, 한 달 새 10만명 해지 — 내 집 마련 계획을 다시 확인해요\n\n무슨 일이야?\n• 청약통장 가입자는 한 달 새 10만명 감소했어요.\n• 분양가 상승과 낮은 당첨 가능성 때문에 해지가 늘었어요.\n\n그래서 내 돈은?\n• 청약을 유지 중이라면 해지 조건을 먼저 확인해요.\n• 집을 준비 중이라면 월 납입 부담을 비교해요.\n\n오늘 확인할 것\n은행 앱에서 납입 횟수와 인정 금액을 확인하세요.\n\n놓치기 싫다면 저장해두고 필요한 분께 공유해 주세요.\n\n#경제뉴스 #경제공부 #오늘경제 #today_econ',
  };
}

const source = '청약통장 가입자는 한 달 새 10만명 감소했다. 분양가 상승과 낮은 당첨 가능성 때문에 청약통장을 해지하는 가입자가 늘었다.';

test('passes a coherent, readable three-card story', () => {
  const report = evaluateContentQuality(validContent(), source);
  assert.equal(report.passed, true, JSON.stringify(report));
  assert.equal(report.gates.brand_promise.passed, true);
  assert.equal(report.gates.readability.passed, true);
});

test('blocks a numeric claim that is absent from the article', () => {
  const content = validContent();
  content.card2.bullets[0] = '청약통장 가입자는 한 달 새 <hl>37만명</hl> 감소했어요.';
  const report = evaluateContentQuality(content, source);
  assert.equal(report.passed, false);
  assert.match(report.errors.join(' '), /37만/);
});

test('blocks page metadata even when it appeared in the source text', () => {
  const content = validContent();
  content.card2.bullets[1] = '류영상 기자 입력 <hl>2026.07.17</hl> Google 검색 안내예요.';
  const report = evaluateContentQuality(content, `${source} 류영상 기자 입력 : 2026.07.17 Google 검색`);
  assert.equal(report.passed, false);
  assert.match(report.errors.join(' '), /page metadata/);
});

test('blocks topic drift from housing into self-employed retirement copy', () => {
  const content = validContent();
  content.card3.bullets[0] = '자영업자는 <hl>노후자금 납입 여력</hl>을 다시 계산해요.';
  const report = evaluateContentQuality(content, source);
  assert.equal(report.passed, false);
  assert.match(report.errors.join(' '), /drift away/);
});

test('blocks an incomplete ellipsis cover and a forced fourth card', () => {
  const content = validContent();
  content.card1.title = '청약통장 10만...';
  content.card4 = { section_title: '앞으로 이렇게 될 수도', bullets: [] };
  const report = evaluateContentQuality(content, source);
  assert.equal(report.passed, false);
  assert.match(report.errors.join(' '), /ellipsis|exactly three/);
});

test('blocks raw source URLs, dotted tags, and duplicated hashtags', () => {
  const content = validContent();
  content.instagram_caption += '\nhttps://example.com\n#today.econ #경제뉴스';
  const report = evaluateContentQuality(content, source);
  assert.equal(report.passed, false);
  assert.match(report.errors.join(' '), /source URL|#today_econ|duplicated/);
});

test('blocks transformed or contradictory source numbers', () => {
  const content = validContent();
  content.card2.bullets[0] = '청약통장 가입자는 <hl>10만명에서 10만명으로 두 배</hl> 늘었어요.';
  const report = evaluateContentQuality(content, source);
  assert.equal(report.passed, false);
  assert.match(report.errors.join(' '), /contradictory/);
});

test('brand promise gate blocks a generic impact even when its format is valid', () => {
  const content = validContent();
  content.card3.bullets[0] = '내 상황에 맞는 <hl>금액과 적용 조건</hl>이 달라질 수 있어요.';
  const report = evaluateContentQuality(content, source);
  assert.equal(report.passed, false);
  assert.equal(report.gates.brand_promise.passed, false);
  assert.match(report.gates.brand_promise.errors.join(' '), /generic|article topic/);
});

test('brand promise gate requires card2 to carry the strongest article fact', () => {
  const content = validContent();
  content.card2.bullets = [
    '분양가 상승으로 <hl>청약 부담</hl>이 커지고 있어요.',
    '낮은 당첨 가능성 때문에 <hl>해지</hl>를 고민하는 사람이 늘었어요.',
  ];
  const report = evaluateContentQuality(content, source);
  assert.equal(report.passed, false);
  assert.match(report.gates.brand_promise.errors.join(' '), /strongest article fact/);
});

test('brand promise gate requires the cover to carry the strongest numeric signal', () => {
  const content = validContent();
  content.card1.title = '청약통장,\n해지가 늘어난 이유';
  content.analysis.hook_candidates[0] = content.card1.title;
  content.analysis.selected_hook = content.card1.title;
  const report = evaluateContentQuality(content, source);
  assert.equal(report.passed, false);
  assert.match(report.gates.brand_promise.errors.join(' '), /strongest numeric signal/);
});

test('readability gate keeps facts, impacts, and the single action in distinct roles', () => {
  const content = validContent();
  content.card3.bullets[0] = '청약통장 앱에서 <hl>가입 기간</hl>을 확인하세요.';
  const report = evaluateContentQuality(content, source);
  assert.equal(report.passed, false);
  assert.equal(report.gates.readability.passed, false);
  assert.match(report.gates.readability.errors.join(' '), /explain impact/);
});

test('readability gate blocks dense bullets independently of source grounding', () => {
  const content = validContent();
  content.card3.bullets[1] = '집을 준비하는 사람은 분양가와 당첨 가능성과 지역별 공급 물량과 자금 조달 조건과 월 납입 부담을 모두 한꺼번에 비교해야 해서 청약 계획을 세우는 일이 이전보다 훨씬 복잡해질 수 있어요.';
  const report = evaluateContentQuality(content, source);
  assert.equal(report.passed, false);
  assert.match(report.gates.readability.errors.join(' '), /too dense/);
});

test('blocks generic percentage-change covers and photo-credit contamination', () => {
  const content = validContent();
  content.analysis.topic = 'pension_insurance';
  content.analysis.money_channel = 'mixed';
  content.analysis.event_type = 'market_trend';
  content.card1.title = '노후자금, 97.5% 변화';
  content.card1.subtitle = '자영업자는 한도 변화만큼 월별 납입 부담이 달라질 수 있어요.';
  content.card2.bullets = [
    '연금보험 증가율 97.5%는 <hl>기사 내용과는 무관함</hl>이라고 적혀 있어요.',
    '<hl>[연합뉴스]</hl> 올 상반기 연금보험 가입이 급증한 것으로 나타났어요.',
  ];
  content.card3.bullets = [
    '자영업자는 한도 변화만큼 <hl>월별 납입 부담</hl>이 달라질 수 있어요.',
    '노후 준비 중이라면 <hl>공제 비중</hl>을 다시 정하게 돼요.',
    '공식 안내에서 <hl>가입 조건과 납입 한도</hl>를 확인하세요.',
  ];
  content.analysis.strongest_fact = '20대 이하 연금보험 증가율은 97.5%였다.';
  content.analysis.verified_facts = [
    '20대 이하 연금보험 증가율은 97.5%였다.',
    '연금보험 신계약 건수는 전년 동기 대비 78.1% 급증했다.',
  ];
  content.analysis.hook_candidates = [
    content.card1.title,
    '20대 연금보험 가입 97.5% 급증',
    '연금보험 신계약 78.1% 급증',
    '청년층이 연금보험에 몰린 이유',
    '연금보험 가입 전 볼 숫자',
  ];
  content.analysis.selected_hook = content.card1.title;
  const pensionSource = `${content.analysis.verified_facts.join(' ')} 올 상반기 20대 청년층과 5060 고령층의 가입이 늘었다.`;
  const report = evaluateContentQuality(content, pensionSource);

  assert.equal(report.passed, false);
  assert.match(report.errors.join(' '), /generic|photo|credit|pension|self-employed|topic|cover/i);
});

test('blocks bullets that only look complete because a cut-off particle received 이에요', () => {
  const content = validContent();
  content.card2.bullets[0] = '퇴직연금 계좌를 <hl>확인</hl>하는 기준을이에요.';
  const report = evaluateContentQuality(content, source);
  assert.equal(report.passed, false);
  assert.match(report.errors.join(' '), /cut off|incomplete/i);
});
