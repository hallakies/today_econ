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
  card4: '앞으로 이렇게 될 수도',
});

const MONEY_CHANNEL_EVIDENCE = Object.freeze({
  stocks: /주식|증시|종목|스톡론|증권|투자/,
  housing: /주택|부동산|집값|전세|분양|주거/,
  living_cost: /물가|소비자|생활비|가격|장바구니/,
  credit: /대출|금리|담보|한도|신용|차입/,
  tax: /세금|소득세|보유세|취득세|과세/,
  mixed: /주식|증시|종목|스톡론|증권|투자|주택|부동산|집값|전세|분양|물가|소비자|생활비|가격|대출|금리|담보|한도|신용|세금|과세/,
});

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
  const matches = String(text).match(/\d[\d,.]*(?:%|percent|원|조|억|만|명|개|배|퍼센트)/gi) || [];
  return matches.map(value => value.replace(/[,\s]/g, '').toLowerCase());
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

function evaluateContentQuality(content, sourceText = '') {
  const errors = [];
  const warnings = [];
  let score = 100;
  const fail = (message, deduction = 12) => { errors.push(message); score -= deduction; };
  const warn = (message, deduction = 4) => { warnings.push(message); score -= deduction; };
  const source = normalizeSource(sourceText);

  for (const invalid of collectVisibleStrings(content)) fail(`${invalid.path} contains ${invalid.reason}`, 25);

  for (const key of ['card1', 'card2', 'card3', 'card4']) {
    if (!content?.[key] || typeof content[key] !== 'object') fail(`${key} is missing`, 25);
  }

  const title = stripMarkup(content.card1?.title);
  const subtitle = stripMarkup(content.card1?.subtitle);
  if (title.length < 8 || title.length > 32) fail('cover title must be 8-32 characters');
  if (!subtitle || subtitle.length < 8) fail('cover subtitle must explain the reader money effect');
  if (/^(?:혹시|아세요|Did you know)/i.test(title)) fail('cover uses a generic opening', 8);

  const expectedCounts = { card2: 2, card3: 2, card4: 3 };
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
      if (key === 'card3' && isRunOnImpact(plain)) fail(`${key} bullet ${index + 1} merges multiple audience impacts`, 10);
    });
    for (let i = 0; i < card.bullets.length; i += 1) {
      for (let j = i + 1; j < card.bullets.length; j += 1) {
        if (jaccardSimilarity(card.bullets[i], card.bullets[j]) >= 0.65) fail(`${key} repeats the same idea across bullets`, 10);
      }
    }
  }

  const optionalArrays = [content.card2?.stats, content.card2?.hard_terms, content.card3?.hard_terms, content.card4?.hard_terms, content.card4?.policy_points];
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
  } else if (!MONEY_CHANNEL_EVIDENCE[moneyChannel].test(`${sourceText} ${content.analysis?.money_effect || ''}`)) {
    fail(`money_channel ${moneyChannel} lacks source/evidence mapping`, 15);
  }
  const moneyText = [title, subtitle, ...(content.card2?.bullets || []), ...(content.card3?.bullets || [])].map(stripMarkup).join(' ');
  if (!/내 돈|주식|집값|대출|세금|물가|금리|스톡론|부동산|투자/.test(moneyText)) fail('cover and first two cards do not connect the story to reader money', 15);

  const effectiveDate = stripMarkup(content.analysis?.effective_date);
  if (effectiveDate) {
    const effectiveTokens = extractDateTokens(effectiveDate);
    if (effectiveTokens.length === 0 || effectiveTokens.some(token => !source.includes(normalizeSource(token)))) {
      fail('analysis.effective_date must be explicitly grounded in the article', 15);
    }
  }

  const forecasts = content.card4?.bullets || [];
  if (!/(가능|수 있어|달라질|변수|높아질|줄어들|늘어날|커질)/.test(stripMarkup(forecasts[0] || ''))) fail('card4 forecast 1 needs a possibility or variable marker', 8);
  if (!/(가능|수 있어|달라질|변수|높아질|줄어들|늘어날|커질)/.test(stripMarkup(forecasts[1] || ''))) fail('card4 forecast 2 needs a possibility or variable marker', 8);
  if (!/(확인|비교|물어|살펴|기록|저장|계산|점검)/.test(stripMarkup(forecasts[2] || ''))) fail('card4 bullet 3 must be a concrete action', 8);

  const steps = content.card4?.action_steps;
  if (!Array.isArray(steps) || steps.length !== 3) fail('card4 requires exactly three saveable action steps', 10);
  (steps || []).forEach((step, index) => {
    const plain = stripMarkup(step);
    if (!plain || plain.length < 12 || !/(앱|약관|한도|잔액|시행|금리|수수료|담보|조건|비교|확인|계약)/.test(plain)) fail(`card4 action step ${index + 1} is incomplete or lacks a target`, 8);
  });

  const allCardText = [content.card1?.title, content.card1?.subtitle]
    .concat(content.card2?.bullets || [], content.card3?.bullets || [], content.card4?.bullets || [])
    .concat((content.card2?.stats || []).flatMap(stat => [stat?.value, stat?.label, stat?.comparison, stat?.baseline]))
    .concat(content.card4?.action_steps || [])
    .map(value => stripMarkup(value))
    .join(' ');
  const normalizedNumbers = extractMaterialNumbers(allCardText);
  normalizedNumbers.forEach(number => { if (!source.includes(number)) fail(`numeric claim is not grounded in the article: ${number}`, 15); });

  const cardList = [content.card2, content.card3, content.card4];
  for (let i = 0; i < cardList.length; i += 1) for (let j = i + 1; j < cardList.length; j += 1) {
    for (const left of cardList[i]?.bullets || []) for (const right of cardList[j]?.bullets || []) {
      if (jaccardSimilarity(left, right) >= 0.92) fail(`card${i + 2} and card${j + 2} contain duplicate bullet copy`, 10);
    }
  }

  const caption = String(content.instagram_caption || '').trim();
  if (caption.length < 180 || caption.length > 2200) fail('caption must be 180-2200 characters', 8);
  if (!caption.includes(FRIENDLY_SECTIONS.card2) || !caption.includes(FRIENDLY_SECTIONS.card3) || !caption.includes('오늘경제 한 줄 생각') || !caption.includes('앞으로 이렇게 될 수도')) fail('caption is missing a friendly editorial section');
  if (!/https?:\/\//.test(caption)) fail('caption must include the original article URL', 10);
  if (!/[①②③]/.test(caption)) fail('caption is missing a saveable three-step checklist', 8);
  if (!/저장/.test(caption) || !/공유/.test(caption)) fail('caption is missing save/share CTA', 6);
  if (!/(체크|확인|정리|순서|숫자|조건|비교).*(저장|공유)|(저장|공유).*(체크|확인|정리|순서|숫자|조건|비교)/s.test(caption)) fail('CTA lacks a concrete save/share reward', 8);
  if (!caption.includes('?')) warn('caption has no reader question');
  if (/빚투족|무대출자|당신의 금융 상황에 어떤 영향을|오늘경제의 한 줄 해석/i.test(caption)) fail('caption contains old or stigmatizing wording', 10);
  if (collectVisibleStrings(caption).length) fail('caption contains literal invalid text', 20);

  return { score: Math.max(0, score), passed: errors.length === 0 && score >= 80, errors, warnings };
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

module.exports = { assertContentQuality, evaluateContentQuality, jaccardSimilarity, stripMarkup, extractMaterialNumbers, extractDateTokens };
