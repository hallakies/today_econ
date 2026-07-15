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

function stripMarkup(text = '') {
  return String(text).replace(/<\/?hl>/gi, '').replace(/\s+/g, ' ').trim();
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

function evaluateContentQuality(content, sourceText = '') {
  const errors = [];
  const warnings = [];
  let score = 100;

  const fail = (message, deduction = 15) => {
    errors.push(message);
    score -= deduction;
  };
  const warn = (message, deduction = 5) => {
    warnings.push(message);
    score -= deduction;
  };

  for (const key of ['card1', 'card2', 'card3', 'card4']) {
    if (!content[key]) fail(`${key} is missing`, 25);
  }

  const title = stripMarkup(content.card1?.title);
  if (title.length < 8 || title.length > 32) fail('cover title must be 8-32 characters');
  if (/^(?:혹시|아세요|Did you know)/i.test(title)) warn('cover uses a generic opening');

  const expectedSections = ['숫자로 보는 핵심', '내 돈에는 이렇게', '오늘 확인할 것'];
  [content.card2, content.card3, content.card4].forEach((card, index) => {
    if (!card) return;
    if (card.section_title !== expectedSections[index]) {
      fail(`card${index + 2}.section_title must be "${expectedSections[index]}"`, 10);
    }

    if (!Array.isArray(card.bullets)) {
      fail(`card${index + 2}.bullets must be an array`);
      return;
    }

    const expectedCount = index === 2 ? 3 : 2;
    if (card.bullets.length !== expectedCount) {
      fail(`card${index + 2} must contain ${expectedCount} bullets`, 10);
    }

    card.bullets.forEach((bullet, bulletIndex) => {
      const plain = stripMarkup(bullet);
      if (plain.length < 15 || plain.length > 90) {
        fail(`card${index + 2} bullet ${bulletIndex + 1} must be 15-90 characters`, 8);
      }
      const highlights = (String(bullet).match(/<hl>.*?<\/hl>/gi) || []).length;
      if (highlights !== 1) fail(`card${index + 2} bullet ${bulletIndex + 1} needs exactly one highlight`, 8);
      if (GENERIC_PHRASES.some(phrase => plain.includes(phrase))) {
        fail(`card${index + 2} bullet ${bulletIndex + 1} contains generic or sensational wording`, 12);
      }
    });

    for (let i = 0; i < card.bullets.length; i += 1) {
      for (let j = i + 1; j < card.bullets.length; j += 1) {
        if (jaccardSimilarity(card.bullets[i], card.bullets[j]) >= 0.65) {
          fail(`card${index + 2} repeats the same idea across bullets`, 12);
        }
      }
    }
  });

  if (content.card4?.bullets?.[2] && !/(확인|비교|계산|설정|적어|저장|물어|찾아|보세요)/.test(stripMarkup(content.card4.bullets[2]))) {
    warn('the final bullet may not be a concrete action');
  }

  const allCardText = [content.card1?.title, content.card1?.subtitle]
    .concat(content.card2?.bullets || [], content.card3?.bullets || [], content.card4?.bullets || [])
    .join(' ');
  const normalizedSource = String(sourceText).replace(/[,\s]/g, '').toLowerCase();
  for (const number of extractMaterialNumbers(allCardText)) {
    if (!normalizedSource.includes(number)) {
      fail(`numeric claim is not grounded in the article: ${number}`, 20);
    }
  }

  const caption = String(content.instagram_caption || '').trim();
  if (caption.length < 100 || caption.length > 1000) fail('caption must be 100-1000 characters', 10);
  if (!caption.includes('?')) warn('caption has no reader question');
  if (!caption.includes('\n')) warn('caption needs readable paragraph breaks');

  return {
    score: Math.max(0, score),
    passed: errors.length === 0 && score >= 80,
    errors,
    warnings,
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
  evaluateContentQuality,
  jaccardSimilarity,
  stripMarkup,
};
