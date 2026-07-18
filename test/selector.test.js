const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFallbackRanking, rankNewsCandidates, scoreCandidate } = require('../src/selector');

const now = new Date('2026-07-18T00:00:00Z');

test('scores timely, numeric reader-money changes above generic corporate news', () => {
  const useful = {
    title: '고령층 대출 연체율 4년 새 두 배',
    summary: '취약차주 5명 중 1명이 60대 이상으로 월 이자 부담이 커졌다.',
    pubDate: '2026-07-17T12:00:00Z',
  };
  const generic = {
    title: '금융사 대표 취임식 개최',
    summary: '신임 대표가 포부를 밝혔다.',
    pubDate: '2026-07-17T12:00:00Z',
  };
  assert.ok(scoreCandidate(useful, 0, now) > scoreCandidate(generic, 0, now));
});

test('fallback ranking prefers a saveable money change over RSS position', () => {
  const news = [
    { title: '금융사 업무협약 체결', summary: '양사는 MOU를 체결했다.' },
    { title: '청약통장 한 달 새 10만명 감소', summary: '분양가 부담으로 해지가 늘었다.' },
  ];
  assert.equal(buildFallbackRanking(news), 1);
  assert.equal(rankNewsCandidates(news, null)[0], news[1]);
});
