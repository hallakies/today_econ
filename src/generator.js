const Groq = require('groq-sdk');
const config = require('../config');
const { assertContentQuality } = require('./quality');

const MAIN_MODEL = 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = 'llama-3.1-8b-instant';
const STANDARD_HASHTAGS = '#경제공부 #경제뉴스 #오늘의경제 #재테크 #today.econ';

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

function normalizeGeneratedContent(rawCards, caption, selectedNews) {
  const content = sanitizeRecursively({ ...rawCards, instagram_caption: caption });
  content.instagram_caption = finalizeCaption(content.instagram_caption);
  content.template_theme = 'unified';
  content.theme_color = '#3B82F6';
  const date = selectedNews.pubDate ? new Date(selectedNews.pubDate) : new Date();
  content.news_date = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10).replace(/-/g, '.')
    : `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
  return content;
}

function buildCardPrompt() {
  return `당신은 20~30대 직장인과 재테크 초보를 위한 경제 미디어 "오늘경제(@today.econ)"의 수석 에디터입니다.

브랜드 약속: "오늘 가장 중요한 경제 뉴스 하나를, 내 돈에 미치는 영향과 지금 확인할 것까지 1분 안에 설명한다."

작성 원칙:
- 모든 노출 문구는 자연스러운 한국어 해요체로 작성하세요.
- 기사에 없는 수치·정책·인과관계를 만들지 마세요. 불확실한 내용은 "가능성"으로 표시하세요.
- 자극적인 공포 조장, 투자 종목 추천, 정책 찬반 선동을 하지 마세요.
- 각 불릿은 15~90자의 완전한 문장이며, 가장 중요한 구절 하나만 <hl>...</hl>로 표시하세요.
- 한 카드 안에서 같은 단어나 의미를 반복하지 마세요.
- card2~card4를 생략하지 마세요.

카드 구조:
1. card1: 독자의 돈과 연결된 8~32자 표지 훅. "혹시 이거 아세요?"는 금지합니다.
2. card2 "숫자로 보는 핵심": 기사에 명시된 검증 가능한 핵심 사실 2개.
3. card3 "내 돈에는 이렇게": 다른 독자 유형 2개에게 미치는 영향 2개. 예: 대출자/무대출자, 유주택자/무주택자.
4. card4 "오늘 확인할 것": 앞의 2개는 합리적인 전망·변수, 마지막 1개는 오늘 실행 가능한 구체적 확인 행동으로 작성하세요.

용어 해설은 카드당 최대 1개만 제공하고, 사전적 정의와 짧은 비유만 쓰세요.

JSON만 응답하세요:
{
  "analysis": {
    "topic": "성과 비교용 주제 분류",
    "audience": "가장 영향을 받는 독자",
    "hook_type": "숫자|손실회피|반전|시의성 중 하나",
    "verified_facts": ["기사에서 확인한 사실 1", "사실 2"],
    "uncertainty": "기사만으로 단정할 수 없는 부분"
  },
  "cards": {
    "image_prompt": "English high-end editorial 3D visual prompt without text or logos",
    "core_insight": "요약이 아닌 절제된 에디터 결론",
    "card1": { "title": "내 돈과 연결된 훅", "subtitle": "지금 읽어야 하는 이유" },
    "card2": { "section_title": "숫자로 보는 핵심", "bullets": ["사실 1", "사실 2"], "hard_terms": [{"term":"용어","explanation":"짧은 풀이"}] },
    "card3": { "section_title": "내 돈에는 이렇게", "bullets": ["독자 유형별 영향 1", "독자 유형별 영향 2"], "hard_terms": [] },
    "card4": { "section_title": "오늘 확인할 것", "bullets": ["전망 1", "변수 1", "구체적 행동 1"], "hard_terms": [] }
  }
}`;
}

function buildCaptionPrompt() {
  return `당신은 경제 미디어 "오늘경제"의 피드 에디터입니다.
카드를 보지 않아도 가치가 있는 4~6개의 짧은 문단을 작성하세요.
- 1문단: 훅. "혹시 이거 아세요?"는 금지.
- 2~3문단: 핵심 사실과 독자의 돈에 미치는 의미.
- 마지막: 독자가 자신의 상황을 댓글로 말하게 하는 구체적 질문.
- 이모지는 최대 2개, 해시태그와 <hl> 태그는 사용하지 마세요.
- 과장·정책 선동·투자 추천을 하지 마세요.
JSON만 응답하세요: {"instagram_caption":"여러 문단의 캡션"}`;
}

async function generateCardContent(selectedNews) {
  const sourceText = `${selectedNews.title}\n${selectedNews.fullText || selectedNews.summary || ''}`
    .normalize('NFC')
    .slice(0, 12000);

  console.log('[Generator] Generating evidence-led four-card editorial...');
  const cardResult = await executeLLMCall(
    buildCardPrompt(),
    `기사 제목: ${selectedNews.title}\n기사 본문:\n${sourceText}`,
    5000
  );
  if (!cardResult.cards) throw new Error("Validation Failed: missing 'cards' object");

  await new Promise(resolve => setTimeout(resolve, 4000));
  const captionResult = await executeLLMCall(
    buildCaptionPrompt(),
    `기사 제목: ${selectedNews.title}\n카드 원고:\n${JSON.stringify(cardResult.cards, null, 2)}`,
    1800
  );

  const content = normalizeGeneratedContent(
    { ...cardResult.cards, analysis: cardResult.analysis || {} },
    captionResult.instagram_caption || '',
    selectedNews
  );

  const qualityReport = assertContentQuality(content, sourceText);
  content.quality_score = qualityReport.score;
  content.content_metadata = {
    topic: content.analysis?.topic || '미분류',
    audience: content.analysis?.audience || '재테크 초보',
    hook_type: content.analysis?.hook_type || '미분류',
  };
  console.log(`[Generator] Quality gate passed: ${qualityReport.score}/100`);
  return content;
}

module.exports = {
  buildCaptionPrompt,
  buildCardPrompt,
  finalizeCaption,
  generateCardContent,
  normalizeGeneratedContent,
  parseJsonResponse,
  sanitizeText,
};
