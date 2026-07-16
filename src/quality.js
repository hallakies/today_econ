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

  const expectedSections = ['무슨 일이 바뀌나', '누가 먼저 체감하나', '오늘 확인할 것'];
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
      if (plain.length < 15 || plain.length > 110) {
        warn(`card${index + 2} bullet ${bulletIndex + 1} is outside the preferred 15-110 character range`, 3);
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

  if (!Array.isArray(content.card2?.stats) || content.card2.stats.length === 0) {
    warn('card2 should expose at least one verified statistic as a visual comparison', 6);
  } else {
    content.card2.stats.forEach((stat, index) => {
      if (!stat || !stat.value || !stat.label) warn(`card2 stat ${index + 1} needs value and label`, 3);
    });
  }

  if (!Array.isArray(content.card4?.action_steps) || content.card4.action_steps.length === 0) {
    fail('card4 should include a concrete checklist', 8);
  } else {
    content.card4.action_steps.forEach((step, index) => {
      const plain = stripMarkup(step);
      if (/문턱과\s*을|과\s*을/.test(plain) || !/(앱|약관|한도|잔액|시행|금리|수수료|담보|조건|비교|확인)/.test(plain)) {
        fail(`card4 action step ${index + 1} is incomplete or lacks a target`, 8);
      }
    });
  }

  if (content.card4?.bullets?.[2] && !/(확인|비교|계산|설정|적어|저장|물어|찾아|보세요)/.test(stripMarkup(content.card4.bullets[2]))) {
    warn('the final bullet may not be a concrete action');
  }

  const allCardText = [content.card1?.title, content.card1?.subtitle]
    .concat(content.card2?.bullets || [], content.card3?.bullets || [], content.card4?.bullets || [])
    .concat((content.card2?.stats || []).flatMap(stat => [stat?.value, stat?.label, stat?.comparison, stat?.baseline]))
    .concat(content.card4?.policy_points || [], content.card4?.action_steps || [])
    .join(' ');

  const cardsForDuplicateCheck = [content.card2, content.card3, content.card4];
  for (let i = 0; i < cardsForDuplicateCheck.length; i += 1) {
    for (let j = i + 1; j < cardsForDuplicateCheck.length; j += 1) {
      const left = cardsForDuplicateCheck[i]?.bullets || [];
      const right = cardsForDuplicateCheck[j]?.bullets || [];
      for (const leftBullet of left) {
        for (const rightBullet of right) {
          if (jaccardSimilarity(leftBullet, rightBullet) >= 0.92) {
            fail(`card${i + 2} and card${j + 2} contain duplicate bullet copy`, 12);
          }
        }
      }
    }
  }
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
  if (/빚투족|무대출자|당신의 금융 상황에 어떤 영향을/i.test(caption)) {
    fail('caption contains stigmatizing or generic audience wording', 10);
  }
  if (!caption.includes('오늘경제의 한 줄 해석')) warn('caption is missing the editorial point of view', 5);
  if (!/[①②③]/.test(caption)) warn('caption is missing a saveable three-step checklist', 5);
  if (!/저장|공유/.test(caption)) warn('caption is missing a save/share CTA', 4);

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
