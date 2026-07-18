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
        '청약을 유지 중이라면 <hl>해지 전 회복할 수 없는 조건</hl>을 먼저 확인해요.',
        '집을 준비 중이라면 <hl>청약 계획과 월 납입 부담</hl>을 함께 비교해요.',
        '은행 앱에서 <hl>납입 횟수와 인정 금액</hl>을 확인하세요.',
      ],
      hard_terms: [],
    },
    analysis: {
      money_channel: 'housing',
      money_effect: '청약 계획과 납입 부담이 달라질 수 있어요.',
      uncertainty: '분양가와 당첨 가능성에 따라 판단이 달라질 수 있어요.',
    },
    instagram_caption: '청약통장, 한 달 새 10만명 해지 — 내 집 마련 계획을 다시 확인해요\n\n무슨 일이야?\n• 청약통장 가입자는 한 달 새 10만명 감소했어요.\n• 분양가 상승과 낮은 당첨 가능성 때문에 해지가 늘었어요.\n\n그래서 내 돈은?\n• 청약을 유지 중이라면 해지 조건을 먼저 확인해요.\n• 집을 준비 중이라면 월 납입 부담을 비교해요.\n\n오늘 확인할 것\n은행 앱에서 납입 횟수와 인정 금액을 확인하세요.\n\n놓치기 싫다면 저장해두고 필요한 분께 공유해 주세요.\n\n#경제뉴스 #경제공부 #오늘경제 #today_econ',
  };
}

const source = '청약통장 가입자는 한 달 새 10만명 감소했다. 분양가 상승과 낮은 당첨 가능성 때문에 청약통장을 해지하는 가입자가 늘었다.';

test('passes a coherent, readable three-card story', () => {
  const report = evaluateContentQuality(validContent(), source);
  assert.equal(report.passed, true, JSON.stringify(report));
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
