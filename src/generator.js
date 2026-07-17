const Groq = require('groq-sdk');
const config = require('../config');
const { assertContentQuality, extractMaterialNumbers, jaccardSimilarity } = require('./quality');
const { loadPipelineState } = require('./pipeline-state');

const MAIN_MODEL = 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = 'llama-3.1-8b-instant';
const STANDARD_HASHTAGS = '#경제공부 #경제뉴스 #오늘의경제 #재테크 #today.econ';
const FRIENDLY_SECTIONS = Object.freeze({
  card2: '무슨 일이야?',
  card3: '그래서 내 돈은?',
  card4: '앞으로 이렇게 될 수도',
});
const MONEY_CHANNELS = Object.freeze(['stocks', 'housing', 'living_cost', 'credit', 'tax', 'mixed']);
const MAX_QUALITY_REPAIR_ATTEMPTS = 2;

function getGroqClient() {
  return new Groq({ apiKey: config.groqApiKey });
}

async function callGroqWithRetry(params, retries = 5, delayMs = 8000) {
  const groq = getGroqClient();
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await groq.chat.completions.create(params);
    } catch (error) {
      const retryable = error.status === 429 || error.status >= 500 || /rate|timeout/i.test(error.message || '');
      if (!retryable || attempt === retries) throw error;
      console.warn(`[Generator] API retry ${attempt}/${retries} in ${delayMs}ms: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs *= 2;
    }
  }
  throw new Error('[Generator] retry loop ended unexpectedly');
}

function parseJsonResponse(text) {
  let jsonText = String(text || '').trim();
  const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) jsonText = fenced[1].trim();
  const firstBrace = jsonText.indexOf('{');
  const lastBrace = jsonText.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) jsonText = jsonText.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonText);
}

async function executeLLMCall(systemPrompt, userPrompt, maxTokens) {
  const request = async (model, temperature, tokens) => {
    const response = await callGroqWithRetry({
      model,
      messages: [
        { role: 'system', content: systemPrompt.normalize('NFC') },
        { role: 'user', content: userPrompt.normalize('NFC') },
      ],
      temperature,
      max_tokens: tokens,
      response_format: { type: 'json_object' },
    });
    return parseJsonResponse(response.choices[0]?.message?.content);
  };

  try {
    return await request(MAIN_MODEL, 0.45, maxTokens);
  } catch (error) {
    console.warn(`[Generator] ${MAIN_MODEL} failed, using fallback: ${error.message}`);
    return request(FALLBACK_MODEL, 0.25, Math.min(maxTokens, 3000));
  }
}

function sanitizeText(text) {
  if (typeof text !== 'string') return text;
  return text
    .normalize('NFC')
    .replace(/:[a-zA-Z0-9_]+:/g, '')
    .replace(/[\u4e00-\u9fa5]/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/빚투족/g, '레버리지 투자자')
    .replace(/무대출자/g, '일반 투자자')
    .trim();
}

function sanitizeRecursively(value) {
  if (Array.isArray(value)) return value.map(sanitizeRecursively);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitizeRecursively(child)]));
  }
  return typeof value === 'string' ? sanitizeText(value) : value;
}

function finalizeCaption(caption) {
  let clean = sanitizeText(caption || '');
  const hashtagIndex = clean.indexOf('#');
  if (hashtagIndex >= 0) clean = clean.slice(0, hashtagIndex).trim();
  return `${clean}\n\n${STANDARD_HASHTAGS}`;
}

function normalizeActionStep(step, index) {
  const clean = plainBulletText(step)
    .replace(/^[①②③④⑤\d.)\s-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  if (/대출 문턱과\s*을|문턱과\s*을/.test(clean)) return '대출 문턱과 조건을 비교하세요.';
  if (clean.length < 12) return '';
  if (/한다[.!]?$/.test(clean)) return `${clean.replace(/한다[.!]?$/, '')}하세요.`;
  if (!/[.!요다세요]$/.test(clean)) return `${clean}하세요.`;
  return clean;
}

function normalizeActionSteps(steps) {
  const defaults = [
    '앱에서 현재 한도와 잔액을 확인하세요.',
    '약관에서 시행일과 적용 기준을 확인하세요.',
    '추가 이용 전 금리와 수수료를 비교하세요.',
  ];
  const normalized = (Array.isArray(steps) ? steps : [])
    .slice(0, 3)
    .map(normalizeActionStep)
    .filter(Boolean);
  for (const fallback of defaults) {
    if (normalized.length >= 3) break;
    if (!normalized.includes(fallback)) normalized.push(fallback);
  }
  return normalized.slice(0, 3);
}

function ensureCompleteSentence(value) {
  const text = plainBulletText(value);
  if (!text) return '';
  if (/[.!?]$/.test(text) || /(?:요|다|니다|습니다|세요|예요|이에요)$/.test(text)) return text;
  if (/(?:확대|제한|변경|시행|지원|관리|증가|감소|가능|준비|확인|비교|신청|유지|도입)$/.test(text)) return `${text}돼요.`;
  return `${text}이에요.`;
}

function hasGroundedEffectiveDate(value, sourceText) {
  const clean = plainBulletText(value);
  if (!clean) return false;
  const source = normalizeEvidence(sourceText);
  const tokens = clean.match(/\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{4}년\s*\d{1,2}월(?:\s*\d{1,2}일)?|\d{1,2}월(?:\s*\d{1,2}일)?/g) || [];
  return tokens.length > 0 && tokens.every(token => source.includes(normalizeEvidence(token)));
}

function moneyFallbackSubtitle(sourceText = '') {
  const text = String(sourceText);
  if (/노란우산|공제|노후|퇴직|연금|자영업|소상공인/.test(text)) return '자영업자라면 내 노후자금 계획을 확인해요';
  if (/주택|부동산|전세|분양/.test(text)) return '내 집값·대출 계획에 미칠 영향을 봐요';
  if (/물가|생활비|소비자/.test(text)) return '내 생활비와 소비 계획에 연결돼요';
  if (/세금|과세|공제/.test(text)) return '내 세금과 현금흐름을 확인해요';
  if (/주식|증시|종목|ETF|코인/.test(text)) return '내 투자금과 리스크를 다시 점검해요';
  return '내 돈의 선택지가 어떻게 달라지는지 봐요';
}

function forecastFallback(sourceText = '', index = 0) {
  if (/노란우산|공제|노후|퇴직|연금|자영업|소상공인/.test(sourceText)) {
    return index === 0
      ? '제도 활용 폭은 <hl>사업 소득과 납입 여력</hl>에 따라 달라질 수 있어요.'
      : '실제 체감 혜택은 <hl>가입 조건과 유지 기간</hl>에 따라 달라질 수 있어요.';
  }
  return index === 0
    ? '실제 영향은 <hl>개인별 조건과 적용 시점</hl>에 따라 달라질 수 있어요.'
    : '시장 반응은 <hl>후속 정책과 금리 환경</hl>에 따라 달라질 수 있어요.';
}

function compactCoverTitle(title = '') {
  const clean = plainBulletText(title).replace(/[“”"'…]/g, '').trim();
  if (clean.length >= 8 && clean.length <= 32) return clean;
  if (clean.length > 32) return `${clean.slice(0, 29).trim()}…`;
  return `${clean || '오늘의 경제 변화'} 핵심`;
}

function sourceFactSentences(sourceText = '') {
  return String(sourceText)
    .split(/[.!?]\s+|\n+/)
    .map(sentence => sanitizeText(sentence).trim())
    .filter(sentence => sentence.length >= 15 && sentence.length <= 88)
    .slice(0, 4);
}

function fallbackImpactBullets(sourceText = '') {
  if (/노란우산|공제|노후|퇴직|연금|자영업|소상공인/.test(sourceText)) {
    return [
      '자영업자는 <hl>월별 납입 여력</hl>을 다시 계산해볼 수 있어요.',
      '노후 준비 중이라면 <hl>기존 저축과의 비중</hl>을 비교해보세요.',
    ];
  }
  if (/주택|부동산|전세|분양/.test(sourceText)) {
    return [
      '집을 준비 중이라면 <hl>내 대출 한도와 자금 계획</hl>을 다시 확인해요.',
      '이미 보유 중이라면 <hl>상환 일정과 현금 여력</hl>을 함께 점검해요.',
    ];
  }
  return [
    '내 상황에 맞는 <hl>금액과 적용 조건</hl>을 먼저 확인해보세요.',
    '기존 계획과 비교해 <hl>현금흐름의 변화</hl>를 점검해보세요.',
  ];
}

function buildFallbackEditorial(selectedNews) {
  const source = `${selectedNews.title || ''} ${selectedNews.fullText || selectedNews.summary || ''}`;
  const facts = sourceFactSentences(selectedNews.fullText || selectedNews.summary || '');
  const fallbackFacts = [
    '기사에 나온 <hl>변경 내용과 적용 대상</hl>을 함께 확인해야 해요.',
    '실제 적용은 <hl>개인별 가입 조건</hl>에 따라 달라질 수 있어요.',
  ];
  const impacts = fallbackImpactBullets(source);
  return {
    analysis: {
      topic: plainBulletText(selectedNews.title || '경제 변화'),
      audience: /자영업|소상공인/.test(source) ? '자영업자' : '경제 관심 독자',
      hook_type: /\d/.test(source) ? '숫자' : '시의성',
      verified_facts: facts.slice(0, 2),
      money_channel: inferMoneyChannel(source),
      money_effect: moneyFallbackSubtitle(source),
      publication_date: '',
      effective_date: '',
      uncertainty: '개인별 조건과 실제 적용 범위',
    },
    cards: {
      image_prompt: 'English premium editorial financial visual, show a clear policy or household money decision mechanism, dark navy and warm gold palette, generous negative space, no text, no logos',
      series_label: '오늘의 돈 신호',
      core_insight: '내 상황에 맞는 금액과 적용 조건을 먼저 확인하는 것이 중요해요.',
      card1: {
        kicker: '오늘의 쟁점',
        title: compactCoverTitle(selectedNews.title),
        subtitle: moneyFallbackSubtitle(source),
      },
      card2: { section_title: FRIENDLY_SECTIONS.card2, bullets: [facts[0] || fallbackFacts[0], facts[1] || fallbackFacts[1]], stats: [], hard_terms: [] },
      card3: { section_title: FRIENDLY_SECTIONS.card3, bullets: impacts, hard_terms: [] },
      card4: {
        section_title: FRIENDLY_SECTIONS.card4,
        bullets: [forecastFallback(source, 0), forecastFallback(source, 1), '공식 홈페이지에서 <hl>가입·납입 조건</hl>을 확인하세요.'],
        action_steps: ['공식 홈페이지에서 현재 한도와 조건을 확인하세요.', '약관에서 적용 시점과 가입 기준을 확인하세요.', '기존 저축과 월 납입 금액을 비교하세요.'],
        hard_terms: [],
        policy_points: [],
      },
    },
  };
}

function normalizeEvidence(text = '') {
  return String(text).normalize('NFC').replace(/[\s,]/g, '').toLowerCase();
}

function normalizeCoreInsight(value) {
  return plainBulletText(value)
    .replace(/^오늘경제\s*한\s*줄\s*(?:생각|해석)\s*:?\s*/u, '')
    .trim();
}

function normalizeStats(stats, sourceText) {
  const source = normalizeEvidence(sourceText);
  return (Array.isArray(stats) ? stats : []).filter(stat => {
    if (!stat || typeof stat !== 'object') return false;
    const value = plainBulletText(stat.value);
    const label = plainBulletText(stat.label);
    if (!value || !label) return false;
    const visible = ['value', 'comparison', 'baseline'].map(field => plainBulletText(stat[field])).join(' ');
    return extractMaterialNumbers(visible).every(number => source.includes(number));
  }).slice(0, 2);
}

function normalizeTerms(terms) {
  return (Array.isArray(terms) ? terms : []).filter(term => (
    term && typeof term === 'object' && plainBulletText(term.term) && plainBulletText(term.explanation)
  )).slice(0, 2);
}

function buildQualityRepairPrompt(errors) {
  return `${buildCardPrompt()}

이번 원고는 품질 게이트에서 다음 이유로 보류되었습니다:
${errors.map(error => `- ${error}`).join('\n')}

같은 기사에 근거해 오류가 난 필드만 고치세요. 기사에 없는 숫자·정책·날짜를 추가하지 말고, 선택형 stats는 근거가 없으면 빈 배열로 두세요. 전망은 가능성·변수·"수 있어요"·"~될 경우"처럼 불확실성을 분명히 하세요. JSON 구조는 그대로 유지하세요.`;
}

function buildCanonicalCaption(content, sourceLink = '') {
  const facts = (content.card2?.bullets || []).map(plainBulletText).filter(Boolean).slice(0, 2).map(text => text.replace(/[.!?]+$/, ''));
  const impacts = (content.card3?.bullets || []).map(plainBulletText).filter(Boolean).slice(0, 2).map(text => text.replace(/[.!?]+$/, ''));
  const steps = (content.card4?.action_steps || []).map(normalizeActionStep).filter(Boolean).slice(0, 3);
  const forecasts = (content.card4?.bullets || []).slice(0, 2).map(plainBulletText).filter(Boolean);
  const title = plainBulletText(content.card1?.title || '');
  const subtitle = plainBulletText(content.card1?.subtitle || '').replace(/[.!?]+$/, '');
  const insight = normalizeCoreInsight(content.core_insight || '').replace(/[.!?]+$/, '');
  const uncertainty = plainBulletText(content.analysis?.uncertainty || '').replace(/[.!?]+$/, '');
  const paragraphs = [];
  // Captions are intentionally tighter than the card copy: the first two lines
  // earn the pause, while the cards carry the full evidence and explanation.
  if (title || subtitle) paragraphs.push(`${title}${title && subtitle ? ` — ${subtitle}` : subtitle}`.trim());
  if (facts.length) paragraphs.push(`${FRIENDLY_SECTIONS.card2}\n${facts.map(fact => `• ${fact}.`).join('\n')}`);
  if (impacts.length) paragraphs.push(`${FRIENDLY_SECTIONS.card3}\n${impacts.map(impact => `• ${impact}${/[.!?]$/.test(impact) ? '' : '.'}`).join('\n')}`);
  if (insight) paragraphs.push(`오늘경제 한 줄 생각\n${insight}.`);
  if (forecasts.length) paragraphs.push(`앞으로 이렇게 될 수도\n${forecasts.map(forecast => `• ${forecast}${/[.!?]$/.test(forecast) ? '' : '.'}`).join('\n')}`);
  if (uncertainty && !/단정할 수 없|없습니다|없어요/.test(uncertainty)) paragraphs.push(`참고로, ${uncertainty}.`);
  if (steps.length) paragraphs.push(`저장해둘 확인 순서\n${steps.map((step, index) => `${['①', '②', '③'][index]} ${step}`).join('\n')}`);
  paragraphs.push('이 내용이 필요한 분께 저장·공유해 주세요. 지금 이용 중·검토 중·관심 없음 중 어디에 가까운가요?');
  if (sourceLink) paragraphs.push(`🔗 원문 기사\n${sourceLink}`);
  return paragraphs.join('\n\n');
}

const HIGHLIGHT_TAG = /<hl>([\s\S]*?)<\/hl>/gi;
const HIGHLIGHT_STOPWORDS = new Set(['그리고', '하지만', '그래서', '때문에', '관련해', '대해', '대한', '있는', '있어요', '할', '수', '더']);

function plainBulletText(value) {
  return sanitizeText(String(value || '').replace(HIGHLIGHT_TAG, '$1'))
    .replace(/[<>]/g, '')
    .trim();
}

function chooseHighlight(text) {
  const numeric = text.match(/(?<![A-Za-z])\d[\d,.]*(?:(?:조|억|만)(?:원)?|원|명|개|배|%|퍼센트)?/);
  if (numeric) return numeric[0];

  const words = text.split(/\s+/).filter(Boolean);
  const meaningful = words.filter(word => !HIGHLIGHT_STOPWORDS.has(word.replace(/[.,!?]/g, '')));
  const candidate = meaningful.slice(0, 2).join(' ') || words.slice(0, 2).join(' ');
  return candidate.slice(0, 18).trim() || text.slice(0, 8);
}

function ensureSingleHighlight(value) {
  const text = plainBulletText(value);
  if (!text) return text;
  const highlighted = chooseHighlight(text);
  const start = text.indexOf(highlighted);
  if (start < 0) return `<hl>${text.slice(0, Math.min(12, text.length))}</hl>${text.slice(Math.min(12, text.length))}`;
  return `${text.slice(0, start)}<hl>${highlighted}</hl>${text.slice(start + highlighted.length)}`;
}

function normalizeBulletFormatting(content) {
  for (const [key, sectionTitle] of Object.entries(FRIENDLY_SECTIONS)) {
    const card = content[key];
    if (!card || !Array.isArray(card.bullets)) continue;
    card.section_title = sectionTitle;
    card.bullets = card.bullets.map(bullet => ensureSingleHighlight(ensureCompleteSentence(bullet)));
  }
  return content;
}

function normalizeGeneratedContent(rawCards, caption, selectedNews) {
  const content = normalizeBulletFormatting(sanitizeRecursively({ ...rawCards, instagram_caption: caption }));
  content.series_label = content.series_label || '오늘의 돈 신호';
  content.card1 = content.card1 || {};
  content.card1.kicker = content.card1.kicker || '1분 경제 브리핑';
  content.card2 = content.card2 || {};
  content.card3 = content.card3 || {};
  content.card4 = content.card4 || {};
  const source = `${selectedNews.title || ''} ${selectedNews.fullText || selectedNews.summary || ''}`;
  content.card2.stats = normalizeStats(content.card2.stats, source);
  content.card4.policy_points = (Array.isArray(content.card4.policy_points) ? content.card4.policy_points : [])
    .map(plainBulletText)
    .filter(Boolean)
    .slice(0, 3);
  content.card4.action_steps = normalizeActionSteps(content.card4.action_steps);
  content.card2.hard_terms = normalizeTerms(content.card2.hard_terms);
  content.card3.hard_terms = normalizeTerms(content.card3.hard_terms);
  content.card4.hard_terms = normalizeTerms(content.card4.hard_terms);
  content.core_insight = normalizeCoreInsight(content.core_insight);
  content.analysis ||= {};
  content.analysis.effective_date = hasGroundedEffectiveDate(content.analysis.effective_date, source)
    ? plainBulletText(content.analysis.effective_date)
    : '';
  content.analysis.money_channel = MONEY_CHANNELS.includes(content.analysis.money_channel)
    ? content.analysis.money_channel
    : inferMoneyChannel(source);
  const visibleMoneyText = [content.card1.title, content.card1.subtitle]
    .concat(content.card2.bullets || [], content.card3.bullets || [])
    .map(plainBulletText)
    .join(' ');
  if (!/내 돈|주식|집값|대출|세금|물가|금리|스톡론|부동산|투자|노후|퇴직|공제|저축|납입|자영업|소상공인|연금/.test(visibleMoneyText)) {
    content.card1.subtitle = moneyFallbackSubtitle(source);
  }
  const card3Bullets = content.card3.bullets || [];
  content.card4.bullets = (content.card4.bullets || []).map((bullet, index) => {
    const normalized = ensureSingleHighlight(ensureCompleteSentence(bullet));
    if (index < 2 && card3Bullets.some(impact => jaccardSimilarity(normalized, impact) >= 0.72)) {
      return forecastFallback(source, index);
    }
    return normalized;
  });
  content.instagram_caption = finalizeCaption(buildCanonicalCaption(content, selectedNews.link));
  content.template_theme = 'unified';
  const topicText = `${content.analysis?.topic || ''} ${selectedNews.title || ''}`;
  content.theme_color = /반도체|AI|빅테크|코인|가상자산|플랫폼/i.test(topicText) ? '#B883FF'
    : /부동산|주택|대출|금리|채권|예금|보험/i.test(topicText) ? '#D7A84B'
      : '#5C8DFF';
  const date = selectedNews.pubDate ? new Date(selectedNews.pubDate) : new Date();
  content.news_date = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10).replace(/-/g, '.')
    : `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
  return content;
}

function inferMoneyChannel(sourceText = '') {
  const text = String(sourceText);
  const has = pattern => pattern.test(text);
  if (has(/주식|증시|종목|스톡론|증권/)) return 'stocks';
  if (has(/주택|부동산|집값|전세|분양/)) return 'housing';
  if (has(/물가|소비자|생활비|가격/)) return 'living_cost';
  if (has(/대출|금리|담보|한도|신용/)) return 'credit';
  if (has(/세금|소득세|보유세|취득세/)) return 'tax';
  return 'mixed';
}

function buildCardPrompt() {
  const recentFailureHints = loadPipelineState().events
    .filter(event => event.status === 'failed' && event.stage === 'content_generate' && event.error)
    .slice(-3)
    .map(event => `- ${event.error}`)
    .join('\n');
  const failureMemory = recentFailureHints
    ? `\n최근 자동 검수에서 반복된 결함입니다. 이번 원고에서 반드시 피하세요:\n${recentFailureHints}\n`
    : '';
  return `당신은 20~30대 직장인과 재테크 초보를 위한 경제 미디어 "오늘경제(@today.econ)"의 수석 에디터입니다.

브랜드 약속: "오늘 가장 중요한 경제 뉴스 하나를, 내 돈에 미치는 영향과 지금 확인할 것까지 1분 안에 설명한다."

편집 포맷: 매 게시물은 오늘의 돈 신호 시리즈로 발행합니다. 사건 → 작동 원리 → 독자별 영향 → 확인 체크리스트의 흐름을 지키세요.

작성 원칙:
- 모든 노출 문구는 자연스러운 한국어 해요체로 작성하세요.
- 기사에 없는 수치·정책·인과관계를 만들지 마세요. 불확실한 내용은 "가능성"으로 표시하세요.
- 자극적인 공포 조장, 투자 종목 추천, 정책 찬반 선동을 하지 마세요.
- "빚투족", "무대출자", "거리 나앉을 판"처럼 독자를 낙인찍거나 겁주는 표현은 사용하지 마세요.
- 각 불릿은 15~90자의 완전한 문장이며, 가장 중요한 구절 하나만 <hl>...</hl>로 표시하세요.
- 한 카드 안에서 같은 단어나 의미를 반복하지 마세요.
- card2~card4를 생략하지 마세요.
- 숫자는 기사 표기와 단위를 그대로 보존하고, 숫자 카드에는 숫자·기간·비교 기준을 함께 적으세요.
- 사실(기사에 적힌 내용), 해석(오늘경제의 판단), 행동(독자가 지금 할 일)을 문장 역할로 구분하세요.
${failureMemory}

카드 구조:
1. card1: 독자의 돈과 연결된 8~32자 표지 훅. 숫자·시행일·결정 포인트 중 하나를 포함하고 "혹시 이거 아세요?"는 금지합니다. kicker에는 "오늘의 쟁점"을 쓰세요.
2. card2 "무슨 일이야?": 기사에 명시된 검증 가능한 핵심 사실 2개와 선택 가능한 stats 0~2개.
3. card3 "그래서 내 돈은?": 실제 독자 상황 2개를 나눠 영향과 이유를 설명하세요.
4. card4: core_insight는 "오늘경제 한 줄 생각"으로 쓰고, bullets 1~2는 "앞으로 이렇게 될 수도"에 해당하는 가능성·변수, bullet 3은 앱·계약서·약관에서 바로 할 수 있는 행동으로 작성하세요. action_steps에는 목적어가 분명한 실제 확인 순서를 최대 3개로 적으세요.

용어 해설은 카드당 최대 2개만 제공하고, "용어 = 생활 언어 풀이"와 짧은 비유를 쓰세요. 어려운 용어가 없으면 빈 배열입니다.

JSON만 응답하세요:
{
  "analysis": {
    "topic": "성과 비교용 주제 분류",
    "audience": "가장 영향을 받는 독자",
    "hook_type": "숫자|손실회피|반전|시의성 중 하나",
    "verified_facts": ["기사에서 확인한 사실 1", "사실 2"],
    "money_channel": "stocks|housing|living_cost|credit|tax|mixed 중 하나",
    "money_effect": "주식·집값·대출·세금·생활물가 중 무엇이 어떻게 달라질 수 있는지 근거와 함께",
    "publication_date": "기사 게시일이 보이면 기록하고, 없으면 빈 문자열",
    "effective_date": "정책·규제가 실제 적용되는 날짜가 기사에 명시된 경우에만 기록하고, 없으면 빈 문자열",
    "uncertainty": "기사만으로 단정할 수 없는 부분"
  },
  "cards": {
    "image_prompt": "English high-end editorial financial visual prompt: show the article's actual mechanism (for example a stock-collateral loan document, broker app interface, limit gauge, or regulation signal), premium magazine photography or restrained 3D collage, dark navy and warm gold palette, clear subject, generous negative space for Korean overlay, no text, no logos, no coins, no generic office still-life",
    "series_label": "오늘의 돈 신호",
  "core_insight": "오늘경제 한 줄 생각",
    "card1": { "kicker": "오늘의 쟁점", "title": "내 돈과 연결된 훅", "subtitle": "시행일·숫자·독자 영향" },
    "card2": { "section_title": "무슨 일이야?", "bullets": ["사실 1", "사실 2"], "stats": [], "hard_terms": [] },
    "card3": { "section_title": "그래서 내 돈은?", "bullets": ["상황 1의 영향과 이유", "상황 2의 영향과 이유"], "hard_terms": [] },
    "card4": { "section_title": "앞으로 이렇게 될 수도", "bullets": ["가능성 1", "가능성 2", "확인 행동 1"], "action_steps": ["앱·계약서·약관에서 확인할 순서"], "hard_terms": [] }
  }
}`;
}

function buildCaptionPrompt() {
  return `당신은 경제 미디어 "오늘경제"의 피드 에디터입니다.
카드를 보지 않아도 저장할 가치가 있는 5~7개의 짧은 문단을 작성하세요.
- 1문단: 숫자·시행일·독자 영향이 들어간 편집 훅. "혹시 이거 아세요?"는 금지.
- 2문단: 기사 기준으로 확인된 사실 2개를 설명하고, 출처와 불확실성을 구분하세요.
- 3문단: "오늘경제 한 줄 생각"으로 시작하는 독창적인 판단을 한 문장으로 쓰세요.
- 4문단: 이미 이용 중인 사람/신규 검토자 등 독자 상황별 영향을 설명하세요.
- 5문단: 저장할 수 있는 3단계 확인 체크리스트를 ① ② ③ 형식으로 쓰세요.
- 마지막: "이용 중/검토 중/관심 없음"처럼 답하기 쉬운 선택형 질문 하나와 저장·공유 CTA를 넣으세요.
- 이모지는 최대 2개, 해시태그와 <hl> 태그는 사용하지 마세요.
- "빚투족", "무대출자", "당신의 금융 상황에 어떤 영향을" 같은 낙인·일반론 표현은 금지합니다.
- 과장·정책 선동·투자 추천을 하지 마세요.
JSON만 응답하세요: {"instagram_caption":"여러 문단의 캡션"}`;
}

async function generateCardContent(selectedNews) {
  const sourceText = `${selectedNews.title}\n${selectedNews.fullText || selectedNews.summary || ''}`
    .normalize('NFC')
    .slice(0, 12000);

  console.log('[Generator] Generating evidence-led four-card editorial...');
  let cardResult;
  let content;
  let lastError;
  let repairAttempts = 0;

  try {
    cardResult = await executeLLMCall(
      buildCardPrompt(),
      `기사 제목: ${selectedNews.title}\n기사 본문:\n${sourceText}`,
      5000
    );
  } catch (error) {
    error.draft = { cards: {}, analysis: {}, instagram_caption: '' };
    throw error;
  }

  for (let attempt = 0; attempt <= MAX_QUALITY_REPAIR_ATTEMPTS; attempt += 1) {
    try {
      if (!cardResult?.cards) throw new Error("Validation Failed: missing 'cards' object");
      content = normalizeGeneratedContent(
        { ...cardResult.cards, analysis: cardResult.analysis || {} },
        '',
        selectedNews
      );
      const qualityReport = assertContentQuality(content, sourceText);
      content.quality_score = qualityReport.score;
      content.content_metadata = {
        topic: content.analysis?.topic || '미분류',
        audience: content.analysis?.audience || '재테크 초보',
        hook_type: content.analysis?.hook_type || '미분류',
        money_channel: content.analysis?.money_channel || 'mixed',
        editorial_format: 'money-change-brief',
      };
      console.log(`[Generator] Quality gate passed: ${qualityReport.score}/100 after ${repairAttempts} repair attempt(s)`);
      return content;
    } catch (error) {
      lastError = error;
      if (!error.qualityReport || attempt === MAX_QUALITY_REPAIR_ATTEMPTS) break;
      repairAttempts += 1;
      console.warn(`[Generator] Quality gate failed; requesting repair ${repairAttempts}/${MAX_QUALITY_REPAIR_ATTEMPTS}: ${error.message}`);
      try {
        cardResult = await executeLLMCall(
          buildQualityRepairPrompt(error.qualityReport.errors),
          `기사 제목: ${selectedNews.title}\n기사 본문:\n${sourceText.slice(0, 9000)}\n\n수정할 원고 JSON:\n${JSON.stringify(cardResult).slice(0, 12000)}`,
          5000
        );
      } catch (repairError) {
        error.repairError = repairError.message;
        break;
      }
    }
  }

  const error = lastError || new Error('[Generator] Content generation failed without a quality report');
  try {
    const fallbackDraft = buildFallbackEditorial(selectedNews);
    const fallback = normalizeGeneratedContent({ ...fallbackDraft.cards, analysis: fallbackDraft.analysis }, '', selectedNews);
    fallback.content_metadata = {
      topic: fallback.analysis.topic || '미분류',
      audience: fallback.analysis.audience || '경제 관심 독자',
      hook_type: fallback.analysis.hook_type || '시의성',
      money_channel: fallback.analysis.money_channel,
      editorial_format: 'money-change-brief-fallback',
    };
    fallback.instagram_caption = finalizeCaption(buildCanonicalCaption(fallback, selectedNews.link));
    const qualityReport = assertContentQuality(fallback, sourceText);
    fallback.quality_score = qualityReport.score;
    console.warn(`[Generator] Published safe fallback after ${repairAttempts} LLM repair attempt(s).`);
    return fallback;
  } catch (fallbackError) {
    error.fallbackError = fallbackError.message;
  }
  error.repairAttempts = repairAttempts;
  error.draft = content || { cards: cardResult?.cards || {}, analysis: cardResult?.analysis || {}, instagram_caption: '' };
  throw error;
}

module.exports = {
  buildCanonicalCaption,
  buildCaptionPrompt,
  buildCardPrompt,
  finalizeCaption,
  generateCardContent,
  ensureSingleHighlight,
  normalizeGeneratedContent,
  normalizeActionStep,
  normalizeActionSteps,
  inferMoneyChannel,
  buildFallbackEditorial,
  normalizeCoreInsight,
  normalizeStats,
  parseJsonResponse,
  sanitizeText,
};
