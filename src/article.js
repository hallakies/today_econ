const BOILERPLATE_PATTERNS = [
  /[가-힣]{2,4}\s*기자\s*(?:입력|수정)?\s*:?\s*\d{4}[./-]\d{1,2}[./-]\d{1,2}(?:\s+\d{1,2}:\d{2})?/gi,
  /구글\s*검색\s*선호\s*추가/gi,
  /Google\s*검색에서[^.!?]*(?:볼 수 있습니다|보세요)/gi,
  /Google\s*검색[^.!?]*/gi,
  /매일경제\s*기사를\s*더\s*자주\s*볼\s*수\s*있습니다/gi,
  /(?:기사|뉴스)\s*(?:공유|저장|인쇄)/gi,
  /알아보기/gi,
  /해당\s*기사\s*내용과는\s*무관함\.?/gi,
  /기사\s*이해를\s*돕기\s*위한\s*사진임\.?/gi,
  /\[(?:연합뉴스|뉴스1|뉴시스|매경DB|MK스포츠)\]/gi,
  /(?:사진\s*)?(?:확대|축소|닫기)/gi,
  /Image\s*:/gi,
];

const VISIBLE_BOILERPLATE = /(?:[가-힣]{2,4}\s*기자\s*(?:입력|수정)?|Google\s*검색|구글\s*검색|선호\s*추가|알아보기|매일경제\s*기사를\s*더\s*자주|기사\s*내용과는\s*무관|기사\s*이해를\s*돕기|연합뉴스|뉴스1|뉴시스|사진\s*(?:확대|축소))/i;
const ARTICLE_NAVIGATION = /^(?:관련\s*(?:기사|뉴스)|함께\s*(?:읽을|볼)\s*(?:기사|뉴스)|추천\s*(?:기사|뉴스))/;
const MONEY_TERMS = /청약|주택|부동산|집값|전세|분양|대출|금리|신용|연체|주식|증시|ETF|코인|물가|생활비|세금|공제|연금|노후|자영업|소상공인|예금|저축|보험/;
const CHANGE_TERMS = /늘|줄|증가|감소|확대|축소|인상|인하|해지|가입|제한|완화|강화|시행|바뀌|변화|급감|급증/;
const CAUSE_TERMS = /때문|영향|따라|이유|배경|여파|부담|가능성|전망/;
const MATERIAL_NUMBER_PATTERN = /\d[\d,.]*(?:(?:조(?:\d[\d,.]*억)?(?:\d[\d,.]*만)?|억(?:\d[\d,.]*만)?|만)\s*(?:원|명)?|%|퍼센트|원|명|개|배|년|개월|월)/gi;
const STOPWORDS = new Set(['이젠', '정말', '이유는', '무슨', '한달', '관련', '대한', '올해', '이번', '지난']);
const TOPIC_LABELS = Object.freeze({
  housing: '청약·주택',
  stocks: '주식시장',
  living_cost: '생활물가',
  tax: '세금',
  retirement: '노후자금',
  pension_insurance: '연금보험',
  credit: '대출',
});

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

function normalizeMaterialNumber(value = '') {
  return String(value).replace(/[,\s]/g, '').toLowerCase();
}

function extractMaterialNumbers(text = '') {
  return (String(text).match(MATERIAL_NUMBER_PATTERN) || []).map(value => ({
    raw: value,
    normalized: normalizeMaterialNumber(value),
  }));
}

function scoreFact(sentence, keywords, index) {
  const keywordHits = keywords.filter(keyword => sentence.includes(keyword)).length;
  const materialNumbers = extractMaterialNumbers(sentence);
  const score = keywordHits * 5
    + (MONEY_TERMS.test(sentence) ? 5 : 0)
    + materialNumbers.length * 8
    + (CHANGE_TERMS.test(sentence) ? 5 : 0)
    + (CAUSE_TERMS.test(sentence) ? 1 : 0)
    - index * 0.05;
  return { keywordHits, materialNumbers, score };
}

function extractFactRecords(title = '', body = '', limit = 6) {
  const keywords = titleKeywords(title);
  const normalizedTitle = normalizeTitle(title).replace(/\s+/g, '');
  return splitSentences(body)
    .filter(sentence => sentence.length >= 15 && sentence.length <= 140)
    .filter(sentence => !isBoilerplate(sentence))
    .filter(sentence => !ARTICLE_NAVIGATION.test(sentence))
    .filter(sentence => {
      const compact = normalizeTitle(sentence).replace(/\s+/g, '');
      return compact !== normalizedTitle && !compact.startsWith(normalizedTitle);
    })
    .map((sentence, sourceIndex) => {
      const scored = scoreFact(sentence, keywords, sourceIndex);
      return {
        text: sentence,
        score: scored.score,
        keyword_hits: scored.keywordHits,
        material_numbers: scored.materialNumbers,
        source_index: sourceIndex,
      };
    })
    .filter(item => item.score >= 4)
    .sort((a, b) => b.score - a.score || a.source_index - b.source_index)
    .slice(0, limit)
    .map((item, rank) => ({ ...item, rank: rank + 1 }));
}

function extractRelevantFacts(title = '', body = '', limit = 4) {
  return extractFactRecords(title, body, limit).map(item => item.text);
}

function inferTopic(title = '', facts = []) {
  const source = `${title} ${facts.join(' ')}`;
  if (/연금보험|변액연금|변액보험|보험\s*신계약|보험\s*가입/.test(source)) {
    return {
      channel: 'mixed',
      audience: /20대|청년|5060|50대|60대/.test(source) ? '연금보험을 고민하는 20대·5060' : '연금보험 가입을 고민하는 사람',
      key: 'pension_insurance',
    };
  }
  if (/청약|주택|부동산|집값|전세|분양/.test(source)) return { channel: 'housing', audience: '주택을 준비하는 사람', key: 'housing' };
  if (/주식|증시|종목|ETF|코인|스톡론|증권/.test(source)) return { channel: 'stocks', audience: '투자자', key: 'stocks' };
  if (/물가|생활비|소비자|가격/.test(source)) return { channel: 'living_cost', audience: '생활비를 관리하는 사람', key: 'living_cost' };
  if (/세금|과세|소득세|보유세|취득세/.test(source)) return { channel: 'tax', audience: '납세자', key: 'tax' };
  if (/노란우산|소상공인|자영업|공제금|공제\s*(?:한도|납입)/.test(source)) return { channel: 'mixed', audience: '자영업자', key: 'retirement' };
  if (/대출|금리|신용|담보|연체|차주/.test(source)) return { channel: 'credit', audience: '대출을 이용하는 사람', key: 'credit' };
  return { channel: 'mixed', audience: '경제 관심 독자', key: 'mixed' };
}

function inferEventType(topic, source = '') {
  if (/(시행|도입|폐지|개편|규제|한도|지원|법안|정책)/.test(source)) return 'policy_change';
  if (topic === 'pension_insurance' && /(가입|신계약).*(급증|증가)|(?:급증|증가).*(가입|신계약)/.test(source)) return 'market_trend';
  if (/(가격|금리|주가|집값).*(상승|하락|인상|인하)|(?:상승|하락|인상|인하).*(가격|금리|주가|집값)/.test(source)) return 'price_change';
  return 'reported_change';
}

function topicFactBonus(sentence = '', topic = '') {
  if (topic === 'pension_insurance') {
    if (/건강보험|간편보험|펫보험/.test(sentence) && !/연금보험|변액연금/.test(sentence)) return -30;
    if (/연금보험\s*신계약|신계약[^.]{0,30}연금보험/.test(sentence) && /급증|증가|늘/.test(sentence)) return 45;
    if (/(?:20대|50대|60대|청년층|5060).*\d[\d,.]*%/.test(sentence)) return 40;
    if (/연금보험|변액연금/.test(sentence)) return 10;
  }
  return 0;
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

function compactFactHook(fact = '', topicKey = '') {
  const clean = normalizeTitle(fact)
    .replace(/(?:했어요|합니다|했습니다|됐다|되었다|이에요|예요)$/u, '')
    .trim();
  if (topicKey === 'pension_insurance') {
    const youthRate = clean.match(/20대\s*(?:이하|청년층)?[^.!?%]{0,35}?(\d[\d,.]*%)/);
    if (youthRate) return `20대 연금보험 가입\n${youthRate[1]} 급증`;
    const contractRate = clean.match(/연금보험\s*신계약[^.!?%]{0,35}?(\d[\d,.]*%)/);
    if (contractRate) return `연금보험 신계약\n${contractRate[1]} 급증`;
  }
  const ratio = clean.match(/(?:전체\s*)?([가-힣]{2,12})\s*(\d+\s*명\s*중\s*\d+\s*명).*?((?:\d{2}대\s*이상|고령층|청년층))/);
  if (ratio) return `${ratio[1]} ${ratio[2]},\n${ratio[3]}`;
  if (clean.length >= 8 && clean.length <= 34) return clean;
  const number = extractMaterialNumbers(clean)[0]?.raw;
  const topicLabel = TOPIC_LABELS[topicKey] || '';
  if (number && topicLabel) return `${topicLabel}, ${number} 변화`;
  return '';
}

function buildHookCandidates({ title = '', topic = 'mixed', audience = '', factRecords = [] } = {}) {
  const strongest = factRecords[0]?.text || '';
  const materialNumber = factRecords.flatMap(record => record.material_numbers || [])[0]?.raw || '';
  const topicLabel = TOPIC_LABELS[topic] || '';
  const headlineHook = editorialCoverTitle(title, topic);
  const factHook = compactFactHook(strongest, topic);
  const strongestNumbers = new Set(
    (factRecords[0]?.material_numbers || []).map(number => number.normalized)
  );
  const headlineNumbers = extractMaterialNumbers(headlineHook);
  const headlineHasStrongestNumber = headlineNumbers.some(number => strongestNumbers.has(number.normalized));
  const headlineHasNumber = headlineNumbers.length > 0;
  const factHasNumber = extractMaterialNumbers(factHook).length > 0;
  const candidates = [
    {
      text: headlineHook,
      type: 'headline_edit',
      score: headlineHasStrongestNumber ? 130 : (headlineHasNumber ? 95 : 85),
    },
    { text: factHook || `${topicLabel},\n기사에서 확인한 변화`, type: 'strongest_fact', score: factHasNumber ? 125 : 92 },
    { text: materialNumber && topicLabel ? `${topicLabel},\n${materialNumber} 핵심 변화` : `${topicLabel},\n숫자보다 중요한 변화`, type: 'material_number', score: 80 },
    { text: topicLabel && audience ? `${topicLabel},\n${audience}의 선택 변화` : `${topicLabel},\n내 돈의 선택 변화`, type: 'reader_decision', score: 72 },
    { text: topicLabel && CHANGE_TERMS.test(strongest) ? `${topicLabel},\n지금 달라진 이유` : `${topicLabel},\n지금 봐야 할 신호`, type: 'change_signal', score: 64 },
  ];

  const seen = new Set();
  return candidates.map((candidate, index) => {
    const text = String(candidate.text || '').trim();
    const normalized = normalizeTitle(text).replace(/\s+/g, '');
    const valid = text.length >= 8
      && text.length <= 36
      && !/[…]|\.{3}/.test(text)
      && !isBoilerplate(text)
      && normalized
      && !seen.has(normalized);
    if (valid) seen.add(normalized);
    return { ...candidate, index, text, valid };
  });
}

function selectEditorialHook(candidates = []) {
  const ranked = candidates
    .filter(candidate => candidate.valid)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0] || null;
}

function buildArticleBrief({ title = '', fullText = '', summary = '' } = {}) {
  // RSS summaries often retain the one or two concrete figures that are hidden
  // behind photo blocks or omitted from the fetched article wrapper. Treat the
  // summary as supplementary source evidence instead of discarding it whenever
  // a body exists.
  const cleanedBody = cleanArticleText([fullText, summary].filter(Boolean).join('. '));
  const extractedRecords = extractFactRecords(title, cleanedBody, 10);
  const initialFacts = extractedRecords.slice(0, 6).map(item => item.text);
  const topic = inferTopic(title, initialFacts);
  const factRecords = extractedRecords
    .map(record => ({ ...record, topic_score: record.score + topicFactBonus(record.text, topic.key) }))
    .sort((a, b) => b.topic_score - a.topic_score || a.source_index - b.source_index)
    .map((record, index) => ({ ...record, rank: index + 1 }));
  const facts = factRecords.slice(0, 4).map(item => item.text);
  const eventType = inferEventType(topic.key, `${title} ${facts.join(' ')}`);
  const hookCandidates = buildHookCandidates({
    title,
    topic: topic.key,
    audience: topic.audience,
    event_type: eventType,
    factRecords,
  });
  const selectedHook = selectEditorialHook(hookCandidates);
  return {
    title: normalizeTitle(title),
    cleanedBody,
    facts,
    fact_records: factRecords,
    strongest_fact: factRecords[0]?.text || '',
    material_numbers: factRecords.flatMap(record => (
      record.material_numbers.map(number => ({ ...number, fact: record.text, rank: record.rank }))
    )),
    topic: topic.key,
    money_channel: topic.channel,
    audience: topic.audience,
    event_type: eventType,
    hook_candidates: hookCandidates,
    selected_hook: selectedHook,
    cover_title: selectedHook?.text || editorialCoverTitle(title, topic.key),
  };
}

module.exports = {
  BOILERPLATE_PATTERNS,
  VISIBLE_BOILERPLATE,
  buildArticleBrief,
  cleanArticleText,
  buildHookCandidates,
  editorialCoverTitle,
  extractFactRecords,
  extractMaterialNumbers,
  extractRelevantFacts,
  inferTopic,
  isBoilerplate,
  normalizeTitle,
  selectEditorialHook,
};
