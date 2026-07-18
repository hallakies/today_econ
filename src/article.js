const BOILERPLATE_PATTERNS = [
  /[가-힣]{2,4}\s*기자\s*(?:입력|수정)?\s*:?\s*\d{4}[./-]\d{1,2}[./-]\d{1,2}(?:\s+\d{1,2}:\d{2})?/gi,
  /구글\s*검색\s*선호\s*추가/gi,
  /Google\s*검색에서[^.!?]*(?:볼 수 있습니다|보세요)/gi,
  /Google\s*검색[^.!?]*/gi,
  /매일경제\s*기사를\s*더\s*자주\s*볼\s*수\s*있습니다/gi,
  /(?:기사|뉴스)\s*(?:공유|저장|인쇄)/gi,
  /알아보기/gi,
];

const VISIBLE_BOILERPLATE = /(?:[가-힣]{2,4}\s*기자\s*(?:입력|수정)?|Google\s*검색|구글\s*검색|선호\s*추가|알아보기|매일경제\s*기사를\s*더\s*자주)/i;
const MONEY_TERMS = /청약|주택|부동산|집값|전세|분양|대출|금리|신용|연체|주식|증시|ETF|코인|물가|생활비|세금|공제|연금|노후|자영업|소상공인|예금|저축|보험/;
const STOPWORDS = new Set(['이젠', '정말', '이유는', '무슨', '한달', '관련', '대한', '올해', '이번', '지난']);

function cleanArticleText(text = '') {
  let clean = String(text).normalize('NFC');
  for (const pattern of BOILERPLATE_PATTERNS) clean = clean.replace(pattern, ' ');
  return clean
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();
}

function normalizeTitle(title = '') {
  return String(title)
    .normalize('NFC')
    .replace(/[“”"']/g, '')
    .replace(/…+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\?+$/, '')
    .trim();
}

function titleKeywords(title = '') {
  return normalizeTitle(title)
    .replace(/[^0-9A-Za-z가-힣\s]/g, ' ')
    .split(/\s+/)
    .map(token => token.replace(/(?:은|는|이|가|을|를|의|에|로|으로|부터|까지)$/u, ''))
    .filter(token => token.length >= 2 && !STOPWORDS.has(token));
}

function splitSentences(text = '') {
  return cleanArticleText(text)
    .split(/(?<=[.!?])\s+|[\r\n]+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function isBoilerplate(text = '') {
  return VISIBLE_BOILERPLATE.test(String(text));
}

function extractRelevantFacts(title = '', body = '', limit = 4) {
  const keywords = titleKeywords(title);
  const normalizedTitle = normalizeTitle(title).replace(/\s+/g, '');
  return splitSentences(body)
    .filter(sentence => sentence.length >= 15 && sentence.length <= 140)
    .filter(sentence => !isBoilerplate(sentence))
    .filter(sentence => {
      const compact = normalizeTitle(sentence).replace(/\s+/g, '');
      return compact !== normalizedTitle && !compact.startsWith(normalizedTitle);
    })
    .map((sentence, index) => {
      const keywordHits = keywords.filter(keyword => sentence.includes(keyword)).length;
      const score = keywordHits * 4 + (MONEY_TERMS.test(sentence) ? 3 : 0) + (/\d/.test(sentence) ? 2 : 0) - index * 0.05;
      return { sentence, score };
    })
    .filter(item => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.sentence);
}

function inferTopic(title = '', facts = []) {
  const source = `${title} ${facts.join(' ')}`;
  if (/청약|주택|부동산|집값|전세|분양/.test(source)) return { channel: 'housing', audience: '주택을 준비하는 사람', key: 'housing' };
  if (/주식|증시|종목|ETF|코인|스톡론|증권/.test(source)) return { channel: 'stocks', audience: '투자자', key: 'stocks' };
  if (/물가|생활비|소비자|가격/.test(source)) return { channel: 'living_cost', audience: '생활비를 관리하는 사람', key: 'living_cost' };
  if (/세금|과세|소득세|보유세|취득세/.test(source)) return { channel: 'tax', audience: '납세자', key: 'tax' };
  if (/노란우산|공제|연금|노후|자영업|소상공인/.test(source)) return { channel: 'mixed', audience: '자영업자', key: 'retirement' };
  if (/대출|금리|신용|담보|연체|차주/.test(source)) return { channel: 'credit', audience: '대출을 이용하는 사람', key: 'credit' };
  return { channel: 'mixed', audience: '경제 관심 독자', key: 'mixed' };
}

function editorialCoverTitle(title = '', topicKey = '') {
  const clean = normalizeTitle(title);
  const subscription = clean.match(/한\s*달\s*새\s*청약통장\s*(\d+(?:만)?\s*명?)/);
  if (subscription) {
    const count = subscription[1].replace(/\s+/g, '').replace(/(만)(명)$/, '$1 $2');
    return `청약통장,\n한 달 새 ${count} 해지`;
  }

  const leadingNumber = clean.match(/(.{2,14}?(?:통장|대출|금리|물가|세금|주택|집값|연금|공제))[^0-9]{0,12}(\d[\d,.]*(?:조|억|만)?(?:원|명|개|배|%)?)/);
  if (leadingNumber) return `${leadingNumber[1].trim()},\n${leadingNumber[2]} 변화`;

  const clauses = clean.split(/[?!.]|(?:…)|(?:\s[-—]\s)/).map(value => value.trim()).filter(Boolean);
  const candidate = clauses.find(clause => clause.length >= 8 && clause.length <= 28) || clauses.at(-1) || clean;
  if (candidate.length <= 30) return candidate;
  const topicLabel = { housing: '주택 정책', stocks: '투자 시장', living_cost: '생활물가', tax: '세금', retirement: '노후자금', credit: '대출 조건' }[topicKey] || '경제 흐름';
  return `${topicLabel},\n오늘 달라진 핵심`;
}

function buildArticleBrief({ title = '', fullText = '', summary = '' } = {}) {
  const cleanedBody = cleanArticleText(fullText || summary);
  const facts = extractRelevantFacts(title, cleanedBody, 4);
  const topic = inferTopic(title, facts);
  return {
    title: normalizeTitle(title),
    cleanedBody,
    facts,
    topic: topic.key,
    money_channel: topic.channel,
    audience: topic.audience,
    cover_title: editorialCoverTitle(title, topic.key),
  };
}

module.exports = {
  BOILERPLATE_PATTERNS,
  VISIBLE_BOILERPLATE,
  buildArticleBrief,
  cleanArticleText,
  editorialCoverTitle,
  extractRelevantFacts,
  inferTopic,
  isBoilerplate,
  normalizeTitle,
};
