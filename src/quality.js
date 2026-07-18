const GENERIC_PHRASES = [
  '관심을 가져보세요',
  '지켜봐야겠어요',
  '대비해야 해요',
  '주의하세요',
  '유의하세요',
  '모색해야 해요',
  '큰일납니다',
  '깡통',
  '머뭇거리',
];

const FRIENDLY_SECTIONS = Object.freeze({
  card2: '무슨 일이야?',
  card3: '그래서 내 돈은?',
});

const MONEY_CHANNEL_EVIDENCE = Object.freeze({
  stocks: /주식|증시|종목|스톡론|증권|투자/,
  housing: /주택|부동산|집값|전세|분양|주거/,
  living_cost: /물가|소비자|생활비|가격|장바구니/,
  credit: /대출|금리|담보|한도|신용|차입/,
  tax: /세금|소득세|보유세|취득세|과세/,
  mixed: /주식|증시|종목|스톡론|증권|투자|주택|부동산|집값|전세|분양|물가|소비자|생활비|가격|대출|금리|담보|한도|신용|세금|과세|노란우산|공제|노후|퇴직|연금|자영업|소상공인|저축|납입/,
});
const VISIBLE_BOILERPLATE = /(?:[가-힣]{2,4}\s*기자\s*(?:입력|수정)?|Google\s*검색|구글\s*검색|선호\s*추가|알아보기|매일경제\s*기사를\s*더\s*자주)/i;
const TOPIC_DRIFT = Object.freeze({
  housing: /자영업|소상공인|노란우산|퇴직금|노후자금|공제\s*납입/,
  stocks: /청약통장|무주택|분양가|노란우산|공제\s*납입/,
  living_cost: /청약통장|스톡론|노란우산|공제\s*납입/,
  credit: /청약통장|노란우산|공제\s*납입/,
  tax: /청약통장|스톡론|노란우산/,
  pension_insurance: /자영업|소상공인|노란우산|공제\s*(?:한도|납입)|월별\s*납입\s*부담/,
});
const TOPIC_ANCHORS = Object.freeze({
  housing: /청약|주택|집|분양|전세|납입|당첨/,
  stocks: /주식|증시|종목|투자|주가|업종|실적/,
  living_cost: /물가|생활비|가격|지출|결제|품목|소비/,
  tax: /세금|과세|소득세|보유세|취득세|공제|납세/,
  retirement: /노후|연금|공제|납입|자영업|소상공인|저축/,
  pension_insurance: /연금보험|변액연금|변액보험|보험|신계약|가입|사업비|해지환급률/,
  credit: /대출|금리|이자|상환|한도|신용|만기/,
});
const GENERIC_IMPACT = /(?:내 상황에 맞는|적용 조건을 먼저|기존 계획과 비교|현금흐름의 변화|개인별 조건|실제 적용 범위|중요해요)/;
const IMPERATIVE_ENDING = /(?:(?:확인|비교|점검|계산|기록|저장|신청)(?:하|해)(?:보)?(?:세요|요)|살펴(?:보)?세요)[.!]?$/;
const SOURCE_CREDIT_OR_CAPTION = /(?:기사\s*내용과는\s*무관|기사\s*이해를\s*돕기|사진\s*(?:확대|축소)|\[(?:연합뉴스|뉴스1|뉴시스|매경DB|MK스포츠)\])/i;
const GENERIC_CHANGE_COVER = /(?:\d[\d,.]*%\s*(?:핵심\s*)?변화|기사에서\s*확인한\s*변화|오늘\s*달라진\s*핵심|지금\s*봐야\s*할\s*신호)/;
const EVENT_TYPES = new Set(['policy_change', 'market_trend', 'price_change', 'reported_change']);

function stripMarkup(text = '') {
  return String(text ?? '').replace(/<\/?hl>/gi, '').replace(/\s+/g, ' ').trim();
}

function tokenize(text) {
  return new Set(
    stripMarkup(text)
      .replace(/[^0-9A-Za-z가-힣\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length >= 2)
  );
}

function jaccardSimilarity(a, b) {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter(token => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

function extractMaterialNumbers(text = '') {
  const matches = String(text).match(/\d[\d,.]*(?:년|%|percent|원|조|억|만|명|개|배|퍼센트)/gi) || [];
  return matches.map(value => value.replace(/[,\s]/g, '').toLowerCase());
}

function sourceSentences(sourceText = '') {
  return String(sourceText)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(normalizeSource)
    .filter(Boolean);
}

function hasGroundedNumericSentence(text, sourceText) {
  const numbers = extractMaterialNumbers(stripMarkup(text));
  if (!numbers.length) return true;
  return sourceSentences(sourceText).some(sentence => numbers.every(number => sentence.includes(number)));
}

function hasImpossibleNumericComparison(text = '') {
  const plain = stripMarkup(text).replace(/\s+/g, '');
  const repeatedValueWithChange = /(\d[\d,.]*(?:(?:조|억|만)(?:원|명)?|%|원|명|개|배|퍼센트)?)에서\1(?:로|으로)?(?:두배|2배|증가|감소|늘|줄|뛰)/;
  return repeatedValueWithChange.test(plain);
}

function hasConcreteActionTarget(text = '') {
  return /(금리변동일|월(?:상환액|이자)|만기(?:일)?|상환방식|대출잔액|연체(?:여부|율)?|대출한도|한도|잔액|적용(?:시점|기준)|시행일|납입(?:액|여력)|가입조건|세액|보유세|취득세|매수가|매도가|수수료|담보비율|계약기간|갱신조건|사업비|해지환급률|상품설명서|보험료)/.test(stripMarkup(text).replace(/\s+/g, ''));
}

function hasUsefulUncertainty(text = '') {
  const plain = stripMarkup(text);
  if (!plain || !/(예측할수없|알수없|불확실|단정할수없)/.test(plain.replace(/\s+/g, ''))) return true;
  return /(금리|소득|상환|시행|조건|대상|시장|정책|개인별|계약)/.test(plain);
}

function extractDateTokens(text = '') {
  return String(text).match(/\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}월(?:\s*\d{1,2}일)?/g) || [];
}

function normalizeSource(text = '') {
  return String(text).normalize('NFC').replace(/[\s,]/g, '').toLowerCase();
}

function hasLiteralInvalid(value) {
  return typeof value === 'string' && /\b(?:undefined|null)\b/i.test(value);
}

function hasSentenceEnding(text) {
  return /(?:요|다|니다|습니다|세요|있음|가능성|됩니다|예요|수 있어요|할 수 있음)[.!?]?$/u.test(text) || /[.!?]$/.test(text);
}

function isRunOnImpact(text) {
  return /(?:이미|현재).*(?:신규|처음|알아보는).*(?:이미|현재|신규|처음)/.test(text) || text.length > 100;
}

function collectVisibleStrings(value, path = []) {
  const found = [];
  if (value === undefined || value === null) {
    found.push({ path: path.join('.'), reason: 'missing value' });
    return found;
  }
  if (typeof value === 'string') {
    if (hasLiteralInvalid(value)) found.push({ path: path.join('.'), reason: 'literal undefined/null' });
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => found.push(...collectVisibleStrings(child, [...path, index])));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => found.push(...collectVisibleStrings(child, [...path, key])));
  }
  return found;
}

function evaluateBrandPromise(content, sourceText = '') {
  const errors = [];
  let score = 100;
  const fail = (message, deduction = 20) => {
    errors.push(message);
    score -= deduction;
  };
  const analysis = content?.analysis || {};
  const title = stripMarkup(content?.card1?.title);
  const facts = (content?.card2?.bullets || []).map(stripMarkup);
  const impacts = (content?.card3?.bullets || []).slice(0, 2).map(stripMarkup);
  const strongestFact = stripMarkup(analysis.strongest_fact);
  const verifiedFacts = Array.isArray(analysis.verified_facts)
    ? analysis.verified_facts.map(stripMarkup).filter(Boolean)
    : [];
  const hookCandidates = Array.isArray(analysis.hook_candidates)
    ? analysis.hook_candidates.map(stripMarkup)
    : [];
  const selectedHook = stripMarkup(analysis.selected_hook);

  if (!strongestFact || !normalizeSource(sourceText).includes(normalizeSource(strongestFact))) {
    fail('brand promise: strongest article fact is missing or ungrounded', 25);
  }
  if (verifiedFacts.length < 2 || verifiedFacts.some(fact => !normalizeSource(sourceText).includes(normalizeSource(fact)))) {
    fail('brand promise: two article-specific verified facts are required', 25);
  }
  if (hookCandidates.length !== 5 || new Set(hookCandidates.filter(Boolean)).size !== 5) {
    fail('brand promise: five deterministic hook candidates are required', 15);
  }
  if (!selectedHook || normalizeSource(selectedHook) !== normalizeSource(title) || !hookCandidates.some(hook => normalizeSource(hook) === normalizeSource(selectedHook))) {
    fail('brand promise: cover must use the deterministically selected hook', 15);
  }
  if (GENERIC_CHANGE_COVER.test(title)) {
    fail('brand promise: cover uses a generic percentage/change label without an insight', 25);
  }

  const strongestNumbers = extractMaterialNumbers(strongestFact);
  const normalizedTitle = normalizeSource(title);
  if (
    strongestNumbers.length > 0
    && !strongestNumbers.some(number => normalizedTitle.includes(number))
  ) {
    fail('brand promise: cover omits the strongest numeric signal', 20);
  }
  const factCopy = facts.join(' ');
  const strongestFactSupported = facts.some(fact => jaccardSimilarity(fact, strongestFact) >= 0.2)
    || (strongestNumbers.length > 0 && strongestNumbers.every(number => normalizeSource(factCopy).includes(number)));
  if (!strongestFactSupported) fail('brand promise: card2 omits the strongest article fact', 25);

  const topic = analysis.topic;
  const anchor = TOPIC_ANCHORS[topic] || TOPIC_ANCHORS[analysis.money_channel];
  if (topic === 'pension_insurance') {
    if (!/연금보험|변액연금|변액보험/.test(title)) {
      fail('brand promise: pension-insurance cover must name the actual product', 25);
    }
    if (!/가입|신계약|급증|증가/.test(title)) {
      fail('brand promise: pension-insurance cover must state what changed', 20);
    }
  }
  impacts.forEach((impact, index) => {
    if (GENERIC_IMPACT.test(impact)) fail(`brand promise: impact ${index + 1} is generic rather than story-specific`, 20);
    if (anchor && !anchor.test(impact)) fail(`brand promise: impact ${index + 1} is not tied to the article topic`, 20);
  });

  return { score: Math.max(0, score), passed: errors.length === 0 && score >= 80, errors };
}

function evaluateReadability(content) {
  const errors = [];
  let score = 100;
  const fail = (message, deduction = 15) => {
    errors.push(message);
    score -= deduction;
  };
  const title = String(content?.card1?.title || '');
  const titleLines = title.split('\n').map(line => stripMarkup(line)).filter(Boolean);
  if (titleLines.length > 2 || titleLines.some(line => line.length > 22)) {
    fail('readability: cover must fit in at most two short lines', 20);
  }
  if (/[…]|\.{3}/.test(title) || /(?:다|요)(?:한\s*달|이번|새\s)/.test(title.replace(/\s+/g, ' '))) {
    fail('readability: cover contains a truncated or glued clause', 25);
  }

  for (const [key, bullets] of [
    ['card2', content?.card2?.bullets || []],
    ['card3', content?.card3?.bullets || []],
  ]) {
    bullets.forEach((bullet, index) => {
      const plain = stripMarkup(bullet);
      if (plain.length > 72) fail(`readability: ${key} bullet ${index + 1} is too dense`, 12);
      if ((plain.match(/[,;:]/g) || []).length >= 3) fail(`readability: ${key} bullet ${index + 1} has too many clauses`, 10);
    });
  }

  const facts = content?.card2?.bullets || [];
  if (facts.some(fact => IMPERATIVE_ENDING.test(stripMarkup(fact)))) {
    fail('readability: card2 facts must not be written as actions', 15);
  }
  const impacts = (content?.card3?.bullets || []).slice(0, 2);
  if (impacts.some(impact => IMPERATIVE_ENDING.test(stripMarkup(impact)))) {
    fail('readability: the first two card3 bullets must explain impact, not issue commands', 20);
  }
  const action = stripMarkup(content?.card3?.bullets?.[2] || '');
  if (!IMPERATIVE_ENDING.test(action)) fail('readability: the last card3 bullet must be the single action', 20);
  if (impacts.some(impact => jaccardSimilarity(impact, action) >= 0.55)) {
    fail('readability: impact and action roles must be distinct', 15);
  }

  const caption = String(content?.instagram_caption || '');
  if (caption.split(/\n{2,}/).some(paragraph => stripMarkup(paragraph).length > 280)) {
    fail('readability: caption paragraphs must remain scannable', 10);
  }
  return { score: Math.max(0, score), passed: errors.length === 0 && score >= 80, errors };
}

function evaluateContentQuality(content, sourceText = '') {
  const errors = [];
  const warnings = [];
  let score = 100;
  const fail = (message, deduction = 12) => { errors.push(message); score -= deduction; };
  const warn = (message, deduction = 4) => { warnings.push(message); score -= deduction; };
  const source = normalizeSource(sourceText);

  for (const invalid of collectVisibleStrings(content)) fail(`${invalid.path} contains ${invalid.reason}`, 25);

  for (const key of ['card1', 'card2', 'card3']) {
    if (!content?.[key] || typeof content[key] !== 'object') fail(`${key} is missing`, 25);
  }
  if (content?.card4) fail('default editorial must contain exactly three cards', 15);

  const title = stripMarkup(content.card1?.title);
  const subtitle = stripMarkup(content.card1?.subtitle);
  if (title.length < 8 || title.length > 36) fail('cover title must be 8-36 characters');
  if (/[…]|\.{3}/.test(title)) fail('cover title must not end in an ellipsis', 20);
  if (VISIBLE_BOILERPLATE.test(`${title} ${subtitle}`)) fail('cover contains page metadata instead of editorial copy', 25);
  if (!subtitle || subtitle.length < 8) fail('cover subtitle must explain the reader money effect');
  if (/^(?:혹시|아세요|Did you know)/i.test(title)) fail('cover uses a generic opening', 8);
  if (GENERIC_CHANGE_COVER.test(title)) fail('cover must state the subject and direction, not only a percentage change', 25);
  if (SOURCE_CREDIT_OR_CAPTION.test(`${title} ${subtitle}`)) fail('cover contains a photo credit or image-caption disclaimer', 25);
  if (!/(내|부모|가족|월|상환|이자|대출|집값|주택|청약|세금|생활비|노후|사업|자영업|투자금|현금흐름)/.test(`${title} ${subtitle}`)) {
    fail('cover must name a concrete reader money connection', 15);
  }

  const expectedCounts = { card2: 2, card3: 3 };
  for (const [key, expectedTitle] of Object.entries(FRIENDLY_SECTIONS)) {
    const card = content[key];
    if (!card) continue;
    if (card.section_title !== expectedTitle) fail(`${key}.section_title must be "${expectedTitle}"`, 10);
    if (!Array.isArray(card.bullets) || card.bullets.length !== expectedCounts[key]) {
      fail(`${key} must contain exactly ${expectedCounts[key]} bullets`, 10);
      continue;
    }
    card.bullets.forEach((bullet, index) => {
      const plain = stripMarkup(bullet);
      if (!plain) fail(`${key} bullet ${index + 1} is empty`, 12);
      if (plain.length < 15 || plain.length > 90) fail(`${key} bullet ${index + 1} must be 15-90 characters`, 8);
      if (!hasSentenceEnding(plain)) fail(`${key} bullet ${index + 1} must be a complete sentence`, 8);
      if ((String(bullet).match(/<hl>.*?<\/hl>/gi) || []).length !== 1) fail(`${key} bullet ${index + 1} needs exactly one highlight`, 8);
      if (GENERIC_PHRASES.some(phrase => plain.includes(phrase))) fail(`${key} bullet ${index + 1} contains generic or sensational wording`, 12);
      if (VISIBLE_BOILERPLATE.test(plain)) fail(`${key} bullet ${index + 1} contains page metadata`, 25);
      if (SOURCE_CREDIT_OR_CAPTION.test(plain)) fail(`${key} bullet ${index + 1} contains a photo credit or image-caption disclaimer`, 30);
      if (key === 'card3' && isRunOnImpact(plain)) fail(`${key} bullet ${index + 1} merges multiple audience impacts`, 10);
      if (hasImpossibleNumericComparison(plain)) fail(`${key} bullet ${index + 1} has a contradictory numeric comparison`, 25);
      if (!hasGroundedNumericSentence(plain, sourceText)) fail(`${key} bullet ${index + 1} combines numbers that do not appear together in the article`, 25);
    });
    for (let i = 0; i < card.bullets.length; i += 1) {
      for (let j = i + 1; j < card.bullets.length; j += 1) {
        if (jaccardSimilarity(card.bullets[i], card.bullets[j]) >= 0.65) fail(`${key} repeats the same idea across bullets`, 10);
      }
    }
  }

  const optionalArrays = [content.card2?.stats, content.card2?.hard_terms, content.card3?.hard_terms];
  optionalArrays.flat().forEach(value => {
    if (value && typeof value === 'object' && Object.values(value).some(hasLiteralInvalid)) fail('optional metadata contains literal invalid text', 20);
  });
  (content.card2?.stats || []).forEach((stat, index) => {
    if (!stat?.value || !stat?.label) fail(`card2 stat ${index + 1} needs value and label`, 8);
    for (const field of ['value', 'comparison', 'baseline']) {
      const visible = stripMarkup(stat?.[field]);
      for (const number of extractMaterialNumbers(visible)) if (!source.includes(number)) fail(`stat ${field} ${number} is not grounded in the article`, 15);
    }
  });

  const moneyChannel = content.analysis?.money_channel;
  if (!Object.prototype.hasOwnProperty.call(MONEY_CHANNEL_EVIDENCE, moneyChannel)) {
    fail('analysis.money_channel must use the controlled enum', 15);
  } else if (!MONEY_CHANNEL_EVIDENCE[moneyChannel].test(sourceText)) {
    fail(`money_channel ${moneyChannel} lacks source/evidence mapping`, 15);
  }
  const moneyText = [title, subtitle, ...(content.card2?.bullets || []), ...(content.card3?.bullets || [])].map(stripMarkup).join(' ');
  if (!/내 돈|주식|집값|주택|청약|대출|세금|물가|금리|스톡론|부동산|투자|노후|퇴직|공제|저축|납입|자영업|소상공인|연금/.test(moneyText)) fail('cover and first two cards do not connect the story to reader money', 15);

  const effectiveDate = stripMarkup(content.analysis?.effective_date);
  if (effectiveDate) {
    const effectiveTokens = extractDateTokens(effectiveDate);
    if (effectiveTokens.length === 0 || effectiveTokens.some(token => !source.includes(normalizeSource(token)))) {
      fail('analysis.effective_date must be explicitly grounded in the article', 15);
    }
  }

  const action = stripMarkup(content.card3?.bullets?.[2] || '');
  if (!/(확인|비교|살펴|기록|계산|점검)/.test(action)) fail('card3 bullet 3 must be one concrete action', 10);
  if (!hasConcreteActionTarget(action) && !/(납입횟수|인정금액|청약조건|가입조건|적용대상|결제액|손실한도)/.test(action.replace(/\s+/g, ''))) {
    fail('card3 bullet 3 must name a concrete money check', 12);
  }

  const storyText = [title, subtitle, ...(content.card2?.bullets || []), ...(content.card3?.bullets || [])].map(stripMarkup).join(' ');
  const topic = content.analysis?.topic;
  if (TOPIC_DRIFT[topic]?.test(storyText) || TOPIC_DRIFT[moneyChannel]?.test(storyText)) {
    fail(`cards drift away from the ${topic || moneyChannel} article topic`, 25);
  }
  const eventType = content.analysis?.event_type;
  if (!EVENT_TYPES.has(eventType)) fail('analysis.event_type must use the controlled enum', 15);
  if (eventType === 'market_trend' && /(정책|규제|공제\s*한도|제도\s*활용|시행일)/.test(storyText)) {
    fail('market-trend article is incorrectly framed as a policy or limit change', 25);
  }
  if (topic === 'pension_insurance') {
    if (!/연금보험|변액연금|변액보험/.test(storyText)) fail('pension-insurance story lost its product anchor', 25);
    if (!/(사업비|해지환급률|상품설명서|보험료)/.test(action)) {
      fail('pension-insurance action must name a product cost or exit-condition check', 25);
    }
    if (/자영업자|공제\s*한도|월별\s*납입\s*부담/.test(storyText)) {
      fail('pension-insurance story incorrectly targets self-employed mutual-aid readers', 30);
    }
  }

  const allCardText = [content.card1?.title, content.card1?.subtitle]
    .concat(content.card2?.bullets || [], content.card3?.bullets || [])
    .concat((content.card2?.stats || []).flatMap(stat => [stat?.value, stat?.label, stat?.comparison, stat?.baseline]))
    .map(value => stripMarkup(value))
    .join(' ');
  const normalizedNumbers = extractMaterialNumbers(allCardText);
  normalizedNumbers.forEach(number => { if (!source.includes(number)) fail(`numeric claim is not grounded in the article: ${number}`, 15); });

  const cardList = [content.card2, content.card3];
  for (let i = 0; i < cardList.length; i += 1) for (let j = i + 1; j < cardList.length; j += 1) {
    for (const left of cardList[i]?.bullets || []) for (const right of cardList[j]?.bullets || []) {
      if (jaccardSimilarity(left, right) >= 0.92) fail(`card${i + 2} and card${j + 2} contain duplicate bullet copy`, 10);
    }
  }

  const caption = String(content.instagram_caption || '').trim();
  if (caption.length < 120 || caption.length > 1200) fail('caption must be 120-1200 characters', 8);
  if (!caption.includes(FRIENDLY_SECTIONS.card2) || !caption.includes(FRIENDLY_SECTIONS.card3) || !caption.includes('오늘 확인할 것')) fail('caption is missing a friendly three-part editorial structure');
  if (/https?:\/\//.test(caption)) fail('Instagram caption must not include a raw source URL', 10);
  if (!/저장/.test(caption) || !/공유/.test(caption)) fail('caption is missing save/share CTA', 6);
  if ((caption.match(/#today_econ/g) || []).length !== 1 || /#today\.econ/.test(caption)) fail('caption must contain one valid #today_econ hashtag', 12);
  const hashtags = caption.match(/#[0-9A-Za-z가-힣_]+/g) || [];
  if (new Set(hashtags).size !== hashtags.length) fail('caption contains duplicated hashtags', 12);
  if (/빚투족|무대출자|당신의 금융 상황에 어떤 영향을|오늘경제의 한 줄 해석/i.test(caption)) fail('caption contains old or stigmatizing wording', 10);
  if (collectVisibleStrings(caption).length) fail('caption contains literal invalid text', 20);
  if (!hasUsefulUncertainty(content.analysis?.uncertainty)) fail('uncertainty must name the variable that could change the outcome', 10);

  const brandPromise = evaluateBrandPromise(content, sourceText);
  const readability = evaluateReadability(content);
  brandPromise.errors.forEach(message => fail(message, 12));
  readability.errors.forEach(message => fail(message, 10));

  return {
    score: Math.max(0, score),
    passed: errors.length === 0 && score >= 80 && brandPromise.passed && readability.passed,
    errors,
    warnings,
    gates: {
      brand_promise: brandPromise,
      readability,
    },
  };
}

function assertContentQuality(content, sourceText) {
  const report = evaluateContentQuality(content, sourceText);
  if (!report.passed) {
    const error = new Error(`Content quality gate failed (${report.score}/100): ${report.errors.join('; ')}`);
    error.qualityReport = report;
    throw error;
  }
  return report;
}

module.exports = {
  assertContentQuality,
  evaluateBrandPromise,
  evaluateContentQuality,
  evaluateReadability,
  jaccardSimilarity,
  stripMarkup,
  extractMaterialNumbers,
  extractDateTokens,
};
