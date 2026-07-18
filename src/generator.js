const Groq = require('groq-sdk');
const config = require('../config');
const { assertContentQuality, extractMaterialNumbers, jaccardSimilarity } = require('./quality');
const { loadPipelineState } = require('./pipeline-state');
const { buildArticleBrief, isBoilerplate } = require('./article');

const MAIN_MODEL = 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = 'llama-3.1-8b-instant';
const STANDARD_HASHTAGS = '#경제뉴스 #경제공부 #오늘경제 #today_econ';
const FRIENDLY_SECTIONS = Object.freeze({
  card2: '무슨 일이야?',
  card3: '그래서 내 돈은?',
});
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
  clean = clean
    .replace(/https?:\/\/\S+/g, '')
    .replace(/(?:#[0-9A-Za-z가-힣_.-]+\s*)+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return `${clean}\n\n${STANDARD_HASHTAGS}`;
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

function fallbackImpactBullets(brief) {
  if (brief.topic === 'retirement') {
    return [
      '자영업자는 <hl>월별 납입 여력</hl>을 다시 계산해볼 수 있어요.',
      '노후 준비 중이라면 <hl>기존 저축과의 비중</hl>을 비교해보세요.',
      '공식 안내에서 <hl>가입 조건과 납입 한도</hl>를 확인하세요.',
    ];
  }
  if (brief.topic === 'housing') {
    return [
      '청약을 유지 중이라면 <hl>해지 전 회복할 수 없는 조건</hl>을 먼저 확인해요.',
      '집을 준비 중이라면 <hl>청약 계획과 월 납입 부담</hl>을 함께 비교해요.',
      '은행 앱에서 <hl>납입 횟수와 인정 금액</hl>을 확인하세요.',
    ];
  }
  if (brief.topic === 'credit') {
    return [
      '대출 이용 중이라면 <hl>다음 금리변동일과 월 이자</hl>를 함께 확인해요.',
      '부모님 대출이 걱정된다면 <hl>만기와 상환 방식</hl>을 먼저 살펴보세요.',
      '대출 앱에서 <hl>월 상환액과 남은 만기</hl>를 확인하세요.',
    ];
  }
  if (brief.topic === 'stocks') {
    return [
      '투자 중이라면 <hl>내 종목의 직접 영향</hl>이 있는지 구분해보세요.',
      '시장 전체 흐름과 <hl>개별 기업 실적</hl>을 따로 확인해요.',
      '매매 전에 <hl>수수료와 손실 한도</hl>를 확인하세요.',
    ];
  }
  if (brief.topic === 'living_cost') {
    return [
      '가계부에서 <hl>이번 달 필수지출</hl>이 얼마나 늘었는지 확인해요.',
      '가격 변화가 큰 항목은 <hl>구매 시점과 대체재</hl>를 비교해보세요.',
      '지난달과 <hl>같은 품목의 결제액</hl>을 비교하세요.',
    ];
  }
  return [
    '내 상황에 맞는 <hl>금액과 적용 조건</hl>을 먼저 확인해보세요.',
    '기존 계획과 비교해 <hl>현금흐름의 변화</hl>를 점검해보세요.',
    '공식 안내에서 <hl>적용 대상과 시행 시점</hl>을 확인하세요.',
  ];
}

function fallbackCoreInsight(brief) {
  const insights = {
    housing: '청약통장을 깨기 전, 다시 만들 수 없는 가입 기간과 납입 인정을 먼저 따져봐야 해요.',
    credit: '대출 뉴스는 한도보다 내 월 상환액이 실제로 얼마나 달라지는지를 먼저 봐야 해요.',
    stocks: '시장 뉴스와 내 종목의 실적 영향을 구분해야 불필요한 매매를 줄일 수 있어요.',
    living_cost: '물가 뉴스는 체감보다 같은 품목의 실제 결제액을 비교할 때 더 정확해요.',
    tax: '세금 변화는 적용 대상과 시행 시점을 내 상황에 대입해야 실제 부담을 알 수 있어요.',
    retirement: '공제 한도보다 내 소득에서 꾸준히 납입할 수 있는 금액을 먼저 계산해야 해요.',
  };
  return insights[brief.topic] || '내 상황에 적용되는 조건과 금액을 먼저 확인하는 것이 중요해요.';
}

function buildFallbackEditorial(selectedNews) {
  const brief = buildArticleBrief(selectedNews);
  const facts = brief.facts;
  if (facts.length < 2) {
    const error = new Error('[Generator] Article rejected: fewer than two clean, topic-relevant facts');
    error.code = 'ARTICLE_REJECTED';
    throw error;
  }
  const fallbackFacts = [
    '기사에 나온 <hl>변경 내용과 적용 대상</hl>을 함께 확인해야 해요.',
    '실제 적용은 <hl>개인별 가입 조건</hl>에 따라 달라질 수 있어요.',
  ];
  const impacts = fallbackImpactBullets(brief);
  return {
    analysis: {
      topic: brief.topic,
      audience: brief.audience,
      hook_type: /\d/.test(`${brief.title} ${facts.join(' ')}`) ? '숫자' : '시의성',
      verified_facts: facts.slice(0, 2),
      money_channel: brief.money_channel,
      money_effect: impacts[0],
      publication_date: '',
      effective_date: '',
      uncertainty: '개인별 조건과 실제 적용 범위',
    },
    cards: {
      image_prompt: 'English premium editorial financial visual, show a clear policy or household money decision mechanism, dark navy and warm gold palette, generous negative space, no text, no logos',
      series_label: '오늘의 돈 신호',
      core_insight: fallbackCoreInsight(brief),
      card1: {
        kicker: '오늘의 쟁점',
        title: brief.cover_title,
        subtitle: plainBulletText(impacts[0]),
      },
      card2: { section_title: FRIENDLY_SECTIONS.card2, bullets: [facts[0] || fallbackFacts[0], facts[1] || fallbackFacts[1]], stats: [], hard_terms: [] },
      card3: { section_title: FRIENDLY_SECTIONS.card3, bullets: impacts, hard_terms: [] },
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

function buildCanonicalCaption(content) {
  const facts = (content.card2?.bullets || []).map(plainBulletText).filter(Boolean).slice(0, 2).map(text => text.replace(/[.!?]+$/, ''));
  const impacts = (content.card3?.bullets || []).map(plainBulletText).filter(Boolean).slice(0, 2).map(text => text.replace(/[.!?]+$/, ''));
  const action = plainBulletText((content.card3?.bullets || [])[2] || '').replace(/[.!?]+$/, '');
  const title = plainBulletText(content.card1?.title || '');
  const subtitle = plainBulletText(content.card1?.subtitle || '').replace(/[.!?]+$/, '');
  const insight = normalizeCoreInsight(content.core_insight || '').replace(/[.!?]+$/, '');
  const paragraphs = [];
  if (title || subtitle) paragraphs.push(`${title}${title && subtitle ? ` — ${subtitle}` : subtitle}`.trim());
  if (facts.length) paragraphs.push(`${FRIENDLY_SECTIONS.card2}\n${facts.map(fact => `• ${fact}.`).join('\n')}`);
  if (impacts.length) paragraphs.push(`${FRIENDLY_SECTIONS.card3}\n${impacts.map(impact => `• ${impact}${/[.!?]$/.test(impact) ? '' : '.'}`).join('\n')}`);
  if (insight) paragraphs.push(`오늘경제 한 줄 생각\n${insight}.`);
  if (action) paragraphs.push(`오늘 확인할 것\n${action}.`);
  paragraphs.push('놓치기 싫다면 저장해두고, 필요한 분께 공유해 주세요.');
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
  const brief = buildArticleBrief(selectedNews);
  content.series_label = content.series_label || '오늘의 돈 신호';
  content.card1 = content.card1 || {};
  content.card1.kicker = content.card1.kicker || '1분 경제 브리핑';
  content.card2 = content.card2 || {};
  content.card3 = content.card3 || {};
  delete content.card4;
  const source = `${brief.title} ${brief.cleanedBody}`;
  content.card2.stats = normalizeStats(content.card2.stats, source);
  content.card2.hard_terms = normalizeTerms(content.card2.hard_terms);
  content.card3.hard_terms = normalizeTerms(content.card3.hard_terms);
  content.core_insight = normalizeCoreInsight(content.core_insight);
  content.analysis ||= {};
  content.analysis.effective_date = hasGroundedEffectiveDate(content.analysis.effective_date, source)
    ? plainBulletText(content.analysis.effective_date)
    : '';
  content.analysis.money_channel = brief.money_channel;
  content.analysis.topic = brief.topic;
  content.analysis.audience = brief.audience;
  const generatedCover = plainBulletText(content.card1.title);
  content.card1.title = generatedCover.length >= 8
    && generatedCover.length <= 36
    && !/[…]|\.{3}/.test(generatedCover)
    && !isBoilerplate(generatedCover)
    && jaccardSimilarity(generatedCover, brief.title) < 0.75
    ? generatedCover
    : brief.cover_title;
  const fallbackImpacts = fallbackImpactBullets(brief);
  content.card3.bullets = (content.card3.bullets || []).slice(0, 3);
  while (content.card3.bullets.length < 3) content.card3.bullets.push(fallbackImpacts[content.card3.bullets.length]);
  content.card3.bullets = content.card3.bullets.map(bullet => ensureSingleHighlight(ensureCompleteSentence(bullet)));
  if (!content.card1.subtitle || isBoilerplate(content.card1.subtitle)) content.card1.subtitle = plainBulletText(fallbackImpacts[0]);
  content.instagram_caption = finalizeCaption(buildCanonicalCaption(content));
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

편집 포맷: 매 게시물은 오늘의 돈 신호 시리즈 3장으로 발행합니다. 표지 → 사건과 이유 → 독자 영향과 한 가지 행동의 흐름을 지키세요.

작성 원칙:
- 모든 노출 문구는 자연스러운 한국어 해요체로 작성하세요.
- 기사에 없는 수치·정책·인과관계를 만들지 마세요. 불확실한 내용은 "가능성"으로 표시하세요.
- 자극적인 공포 조장, 투자 종목 추천, 정책 찬반 선동을 하지 마세요.
- "빚투족", "무대출자", "거리 나앉을 판"처럼 독자를 낙인찍거나 겁주는 표현은 사용하지 마세요.
- 각 불릿은 15~90자의 완전한 문장이며, 가장 중요한 구절 하나만 <hl>...</hl>로 표시하세요.
- 한 카드 안에서 같은 단어나 의미를 반복하지 마세요.
- card1~card3만 작성하고 card4는 만들지 마세요.
- 숫자는 기사 표기와 단위를 그대로 보존하고, 숫자 카드에는 숫자·기간·비교 기준을 함께 적으세요. 같은 문장에 있는 숫자만 함께 묶고, "1.4%에서 1.4%로 두 배"처럼 앞뒤가 모순되는 비교는 절대 쓰지 마세요.
- 사실(기사에 적힌 내용), 해석(오늘경제의 판단), 행동(독자가 지금 할 일)을 문장 역할로 구분하세요.
- 표지는 뉴스 제목을 반복하지 말고 "부모님 대출", "내 월 이자", "내 노후자금"처럼 독자가 자신의 돈과 연결할 수 있는 표현을 하나 이상 넣으세요.
- card3의 1~2번은 "누가 / 어떤 조건에서 / 무엇이 달라질 수 있는지"를 한 문장에 담고, 3번은 독자가 오늘 확인할 구체적인 행동 하나만 쓰세요.
- image_prompt에는 사람·얼굴·인물 사진을 넣지 말고, 대출 명세서·상환 일정·금리 그래프처럼 기사 메커니즘만 묘사하세요.
${failureMemory}

카드 구조:
1. card1: 독자의 돈과 연결된 8~32자 표지 훅. 숫자·시행일·결정 포인트 중 하나를 포함하고 "혹시 이거 아세요?"는 금지합니다. kicker에는 "오늘의 쟁점"을 쓰세요.
2. card2 "무슨 일이야?": 기사에 명시된 검증 가능한 핵심 사실 2개와 선택 가능한 stats 0~2개.
3. card3 "그래서 내 돈은?": 실제 독자 영향 2개와 지금 확인할 행동 1개를 작성하세요.

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
    "image_prompt": "English high-end editorial financial visual prompt: show the article's actual money mechanism with documents, a repayment schedule, a rate chart, or a policy gauge; no people, no faces, no portraits, no text, no logos, no coins",
    "series_label": "오늘의 돈 신호",
  "core_insight": "오늘경제 한 줄 생각",
    "card1": { "kicker": "오늘의 쟁점", "title": "내 돈과 연결된 훅", "subtitle": "시행일·숫자·독자 영향" },
    "card2": { "section_title": "무슨 일이야?", "bullets": ["사실 1", "사실 2"], "stats": [], "hard_terms": [] },
    "card3": { "section_title": "그래서 내 돈은?", "bullets": ["상황 1의 영향과 이유", "상황 2의 영향과 이유", "오늘 확인할 행동 1개"], "hard_terms": [] }
  }
}`;
}

async function generateCardContent(selectedNews) {
  const brief = buildArticleBrief(selectedNews);
  if (brief.facts.length < 2) {
    const error = new Error('[Generator] Article rejected before generation: fewer than two clean, topic-relevant facts');
    error.code = 'ARTICLE_REJECTED';
    throw error;
  }
  const cleanNews = { ...selectedNews, fullText: brief.cleanedBody };
  const sourceText = `${brief.title}\n${brief.cleanedBody}`
    .normalize('NFC')
    .slice(0, 12000);

  console.log('[Generator] Generating evidence-led three-card editorial...');
  let cardResult;
  let content;
  let lastError;
  let repairAttempts = 0;

  try {
    cardResult = await executeLLMCall(
      buildCardPrompt(),
      `고정된 기사 브리프: ${JSON.stringify(brief)}\n기사 본문:\n${sourceText}`,
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
        cleanNews
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
          `고정된 기사 브리프: ${JSON.stringify(brief)}\n기사 본문:\n${sourceText.slice(0, 9000)}\n\n수정할 원고 JSON:\n${JSON.stringify(cardResult).slice(0, 12000)}`,
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
    const fallbackDraft = buildFallbackEditorial(cleanNews);
    const fallback = normalizeGeneratedContent({ ...fallbackDraft.cards, analysis: fallbackDraft.analysis }, '', cleanNews);
    fallback.content_metadata = {
      topic: fallback.analysis.topic || '미분류',
      audience: fallback.analysis.audience || '경제 관심 독자',
      hook_type: fallback.analysis.hook_type || '시의성',
      money_channel: fallback.analysis.money_channel,
      editorial_format: 'money-change-brief-fallback',
    };
    fallback.instagram_caption = finalizeCaption(buildCanonicalCaption(fallback));
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
  buildCardPrompt,
  finalizeCaption,
  generateCardContent,
  ensureSingleHighlight,
  normalizeGeneratedContent,
  inferMoneyChannel,
  buildFallbackEditorial,
  normalizeCoreInsight,
  normalizeStats,
  parseJsonResponse,
  sanitizeText,
};
