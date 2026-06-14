const Groq = require('groq-sdk');
const config = require('../config');

// Initialize Groq client
const groq = new Groq({
  apiKey: config.groqApiKey,
});

/**
 * Helper to call Groq API with retries on 429 rate limit errors.
 */
async function callGroqWithRetry(params, retries = 5, delayMs = 8000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await groq.chat.completions.create(params);
    } catch (error) {
      const is429 = error.status === 429 || (error.message && error.message.toLowerCase().includes('rate'));
      if (is429 && i < retries - 1) {
        console.warn(`[Groq API] Hit rate limit (429). Retrying in ${delayMs}ms... (Attempt ${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2.0; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
}


/**
 * Sanitizes a single text string by replacing Slack emoji codes and removing multilingual leaks.
 */
function sanitizeText(text) {
  if (typeof text !== 'string') return text;
  
  let clean = text;
  // Clean up any multilingual / translation leaks (like Chinese/Russian leaks)
  const translationMap = {
    '們': '들',
    '들들': '들',
    '智慧': '지혜',
    '圍': '위',
    'Это意味着': '이는',
    '这意味着': '이는',
    '意味着': '의미합니다',
    '机构': '기관',
    '金融': '금융',
    '政策': '정책',
    '韩国': '한국',
    '银行': '은행',
    '保险': '보험',
    '企业': '기업',
    '政府': '정부',
    '率': '율',
    '金融机构': '금융기관'
  };

  for (const [chinese, korean] of Object.entries(translationMap)) {
    clean = clean.replace(new RegExp(chinese, 'g'), korean);
  }

  // Strip any remaining Chinese characters (Kanji/Hanja range) as absolute safety net
  clean = clean.replace(/[\u4e00-\u9fa5]/g, '');

  return clean;
}

/**
 * Recursively sanitizes all text properties in a generated JSON object.
 */
function sanitizeJsonRecursively(obj) {
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeJsonRecursively(item));
  } else if (obj !== null && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeJsonRecursively(value);
    }
    return sanitized;
  } else if (typeof obj === 'string') {
    return sanitizeText(obj);
  }
  return obj;
}

/**
 * Sanitizes the Instagram caption specifically (removing generated hashtags and appending curated ones).
 */
function finalizeCaption(caption) {
  let clean = sanitizeText(caption || '');

  // Strip any generated hashtags to avoid gibberish (like #재발, #영화드림)
  const hashtagIndex = clean.indexOf('#');
  if (hashtagIndex !== -1) {
    clean = clean.substring(0, hashtagIndex).trim();
  }
  
  // Explicitly strip Slack shortcodes like :eyes: to avoid broken text formatting
  clean = clean.replace(/:[a-zA-Z0-9_]+:/g, '');
  clean = clean.replace(/\s+/g, ' ').trim();
  
  // Append highly-curated professional Korean financial hashtags
  const standardHashtags = '\n\n#경제공부 #경제뉴스 #오늘의경제 #10초경제 #today.econ';
  clean += standardHashtags;
  
  return clean;
}

/**
 * Validates and repairs the card JSON content to prevent repetition errors.
 */
function validateAndRepairContent(jsonData) {
  const result = { ...jsonData };

  function cleanText(text, maxLength) {
    if (typeof text !== 'string') return text;
    let clean = text.trim().normalize('NFC');
    
    // Remove common emojis at the beginning
    clean = clean.replace(/^[\uD800-\uDBFF][\uDC00-\uDFFF]\s*/, '');
    clean = clean.replace(/^💡\s*/, '');
    clean = clean.replace(/^[-•*▶▷✓✅☑]\s*/, '');

    // Strip [예측], [영향], [행동] or similar prefixes
    clean = clean.replace(/^\[(?:예측|영향|행동)\]\s*/i, '');
    clean = clean.replace(/^(예측|영향|행동):\s*/i, '');

    // Stripping Korean subject fluff
    clean = clean.replace(/^한국\s*(기업|정부|투자자)는?\s*/g, '');
    clean = clean.replace(/^미국의?\s*/g, '');

    // Remove double spaces
    clean = clean.replace(/\s+/g, ' ').trim();

    // If over limit, find a natural break point instead of cutting mid-sentence
    const visibleText = clean.replace(/<\/?hl>/gi, '');
    if (visibleText.length > maxLength) {
      let visibleCount = 0;
      let inTag = false;
      let cutIndex = clean.length;
      let lastSpaceIdx = -1;

      for (let i = 0; i < clean.length; i++) {
        if (clean[i] === '<' && (clean.substring(i).match(/^<\/?hl>/i))) {
          inTag = true;
        }
        if (inTag) {
          if (clean[i] === '>') inTag = false;
          continue;
        }
        visibleCount++;
        if (clean[i] === ' ') lastSpaceIdx = i;
        if (visibleCount >= maxLength) {
          cutIndex = i + 1;
          break;
        }
      }

      const minAcceptable = Math.floor(maxLength * 0.75);
      let bestCut = cutIndex;
      if (lastSpaceIdx > 0) {
        let vc = 0; let it = false;
        for (let j = 0; j < lastSpaceIdx; j++) {
          if (clean[j] === '<' && clean.substring(j).match(/^<\/?hl>/i)) it = true;
          if (it) { if (clean[j] === '>') it = false; continue; }
          vc++;
        }
        if (vc >= minAcceptable) bestCut = lastSpaceIdx;
      }

      clean = clean.substring(0, bestCut).trim();
      const openCount = (clean.match(/<hl>/gi) || []).length;
      const closeCount = (clean.match(/<\/hl>/gi) || []).length;
      if (openCount > closeCount) clean += '</hl>';
    }
    return clean;
  }

  // Card 2
  if (result.card2 && Array.isArray(result.card2.bullets)) {
    result.card2.bullets = result.card2.bullets.map(b => cleanText(b, 90));
  }
  if (result.card2 && result.card2.editors_insight) {
    result.card2.editors_insight = cleanText(result.card2.editors_insight, 90);
  }

  // Card 3
  if (result.card3 && Array.isArray(result.card3.bullets)) {
    result.card3.bullets = result.card3.bullets.map(b => cleanText(b, 90));
  }
  if (result.card3 && result.card3.editors_insight) {
    result.card3.editors_insight = cleanText(result.card3.editors_insight, 90);
  }

  // Card 1
  if (result.card1 && result.card1.editors_insight) {
    result.card1.editors_insight = cleanText(result.card1.editors_insight, 50);
  }

  // De-duplicate: If card2 and card3 have identical bullets (model repetition glitch)
  if (
    result.card2 &&
    result.card3 &&
    JSON.stringify(result.card2.bullets) === JSON.stringify(result.card3.bullets)
  ) {
    console.warn('[Generator] Validation warning: card2 and card3 bullets are identical. Performing auto-repair...');
    result.card3.section_title = '그래서 어떻게 돼?';
    result.card3.bullets = [
      '내 지출 내역부터 당장 점검해보는 게 중요해요',
      '은행별 우대금리를 꼼꼼하게 비교해보세요',
      '주거래 은행의 숨은 혜택을 다 뒤져보는 건 어떨까요?'
    ];
  }

  // Dedup insights
  if (
    result.card2 &&
    result.card3 &&
    result.card2.editors_insight === result.card3.editors_insight
  ) {
    result.card3.editors_insight = '가계 지출 관리를 철저히 모니터링해야 해요.';
  }

  return result;
}

/**
 * Generates the contents for the 3 Instagram slides and the Instagram post caption.
 * @param {{title: string, link: string, pubDate: string, summary: string, imageUrl: string|null}} selectedNews 
 * @returns {Promise<object>}
 */
async function generateCardContent(selectedNews) {
  const systemPrompt = `당신은 20~30대 친구에게 오늘 경제 뉴스를 쉽게 설명해주는 경제 에디터 "오늘이"입니다.
마치 경제를 잘 아는 친구가 카카오톡으로 "야, 오늘 이런 일 있었어!" 하고 알려주는 느낌으로 써주세요.

### 톤앤매너 (CRITICAL):
- **캐주얼 반존대(해요체)**를 사용하세요. 예: "~에요", "~거든요", "~인데요", "~이래요", "~했어요", "~더라고요", "~죠"
- 절대 딱딱한 뉴스 앵커처럼 쓰지 마세요. 친구가 메신저나 커피숍에서 설명해주는 느낌!
- 예시 (Good): "미국이 금리를 확 낮췄어요. 내 대출 이자, 진짜 줄어들까요?"
- 예시 (Bad): "미국 연방준비제도이사회가 기준금리 인하를 단행했다"
- **[CRITICAL] 어미 반복 방지**: 동일한 카드 내 불릿이나 인접 문장에서 동일한 어미(예: "~있어요", "~있어요")를 연속해서 사용하지 마세요. "~거든요", "~이래요", "~될 수 있어요", "~되더라고요" 등 다양한 어미를 섞어서 문장의 리듬감을 만들어주세요.

### Hook-First 타이틀 작성법 (CRITICAL):
- 1장(card1)의 타이틀은 사람들이 스크롤을 멈추게 만드는 **질문, 놀라운 숫자, 또는 감정적 반응**이어야 해요.
- 뉴스 헤드라인을 그대로 옮기지 마세요. "이게 2030 내 지갑에 어떤 영향이지?"를 자극하는 문장으로 바꿔주세요.
- Good: "매달 기름값에 25만원? 아끼는 방법이 있어요", "월급의 7%가 이자로 날아간다고요?", "10억 가진 자산가들이 예금을 빼는 진짜 이유"
- Bad: "주유 할인카드 다시 뜬다", "금리 인상 소식", "10억 이상 자산가 자산관리 경쟁"

### 카드별 구성:
1. **card1 (표지)**: Hook 타이틀 + 부제 + 에디터 한 줄 코멘트
2. **card2 (무슨 일이야?)**: 핵심 팩트 3가지를 쉽게 풀어서 설명. 어려운 용어는 반드시 hard_terms로 뽑아서 초등학생도 이해할 수 있게 비유를 들어주세요.
3. **card3 (그래서 어떻게 돼?)**: 
   - 첫 번째 불릿: 이 뉴스가 불러올 변화 (예측)
   - 두 번째 불릿: 내 지갑/생활에 미치는 영향 (영향)
   - 세 번째 불릿: 지금 당장 할 수 있는 구체적인 행동 (행동, "~해보세요!" 형태 필수)
   - **[CRITICAL] 텍스트 안에 "[예측]", "[영향]", "[행동]" 이라는 글자(말머리표, 대괄호)를 절대로 넣지 마세요.** 오직 내용만 자연스럽게 적으세요.

### 불릿 포인트 작성 규칙:
- 각 불릿은 **구체적 데이터와 맥락이 포함된 완전한 문장(30~50자)**으로 작성
- 단순 단어 나열이나 명사형 종결 절대 금지. 반드시 서술어가 있는 완전한 문장으로!
- **강조할 핵심 키워드는 반드시 \`<hl>강조텍스트</hl>\` 태그로 감싸주세요**
- 연속된 불릿에서 동일한 주어로 시작하는 것 금지. 다채로운 문장 구조 사용
- 하나의 카드 안에서 어미(종결 표현)가 겹치지 않도록 다양하게

### 에디터 인사이트(editors_insight):
- 뻔한 조언("투자 전략을 재조정하세요") 금지
- 대신 이 뉴스의 거시경제적 파급력을 냉철하게 1문장으로 예측
- 카드의 다른 텍스트를 반복하지 않는 새로운 관점 제시
- 20자 내외, <hl>태그 활용

### 용어 설명(hard_terms) (CRITICAL):
- 기사에서 일반인이 모를 경제 용어를 반드시 1~2개 뽑아 쉽게 풀어주세요.
- 초등학생도 이해할 수 있는 비유 필수. 설명의 끝은 반드시 **"~같은 거예요" 또는 "~라고 보면 돼요"** 와 같이 입말 형태로 작성해주세요. (10~15자 내외)
- 예: "기준금리" → "은행 이자의 '원가' 같은 거예요"
- 예: "LTV" → "집값 대비 대출 한도 비율이라고 보면 돼요"

### 인스타그램 캡션 작성법 (CRITICAL):
- 광고체/스팸체 절대 금지 ("어려움을 겪고 계신가요?", "주유 카드 혜택을 확인하고 즉시 신청하여 혜택을 받으세요" 같은 문장은 절대로 쓰지 마세요!)
- 운영자 "오늘이"의 1인칭 시점으로, 마치 친한 친구에게 메신저를 보내는 것처럼 작성하세요.
- **구조**:
  1. 스토리텔링 오프닝: "오늘 경제 뉴스 보다가 깜짝 놀랐는데 말이죠~", "혹시 이거 들어보셨어요?"
  2. 내용 핵심 요약: "알고 보니 ~이렇다더라고요.", "우리한테는 ~하게 작용할 수 있대요!"
  3. 친근한 마무리 한마디: "주말에 내 지갑 상황 한번 점검해보는 것도 좋겠어요 ☕"
- 이모지 자유롭게 사용 (단, 슬랙용 숏코드 :eyes: 등은 절대 금지, 유니코드 이모지만 사용)
- 해시태그는 넣지 마세요 (자동으로 삽입됨)

### 콘텐츠 중복 배제 (CRITICAL):
- 같은 카드 내 불릿끼리 핵심 단어 반복 금지
- 불릿과 에디터 평 사이에도 단어 반복 금지

반드시 마크다운 백틱 없이 순수한 JSON 포맷으로만 응답해야 합니다.

### 응답 JSON 스키마:
{
  "card1": {
    "title": "스크롤을 멈추게 하는 Hook 타이틀 (강조: <hl>태그</hl> 활용. 줄바꿈: \\n 사용)",
    "subtitle": "타이틀 보충 부제목 (1줄)",
    "editors_insight": "20자 내외 냉철한 인사이트 (<hl>태그</hl> 활용)"
  },
  "card2": {
    "section_title": "무슨 일이야?",
    "bullets": [
      "팩트 1 (30~50자, <hl>태그</hl> 활용, 완전한 문장)",
      "팩트 2",
      "팩ct 3"
    ],
    "hard_terms": [
      { "term": "어려운 용어", "explanation": "쉬운 비유 (~같은 거예요 / ~라고 보면 돼요)" }
    ],
    "editors_insight": "한 줄 에디터 평 (<hl>태그</hl> 활용)"
  },
  "card3": {
    "section_title": "그래서 어떻게 돼?",
    "bullets": [
      "변화 전망 (말머리표 [예측] 쓰지 말 것, 30~50자, <hl>태그</hl> 활용)",
      "내 지갑 영향 (말머리표 [영향] 쓰지 말 것)",
      "구체적 행동 (~해보세요!) (말머리표 [행동] 쓰지 말 것)"
    ],
    "hard_terms": [
      { "term": "어려운 용어 (없으면 빈 배열 [])", "explanation": "쉬운 비유 (~같은 거예요 / ~라고 보면 돼요)" }
    ],
    "editors_insight": "행동 유도 에디터 평 (<hl>태그</hl> 활용)"
  },
  "instagram_caption": "오늘이의 1인칭 친구 톡 스타일 캡션 (<hl> 태그 금지, 유니코드 이모지 자유)"
}`;

  let userPrompt = `### 선택된 뉴스 기사 정보:
제목: ${selectedNews.title}
링크: ${selectedNews.link}
기사 요약: ${selectedNews.summary}

위의 기사 내용을 분석하여, 20~30대 친구에게 쉽게 설명하듯이 카드 뉴스 원고와 인스타그램 캡션을 생성해 주세요.`;

  let attempt = 0;
  const maxAttempts = 3;
  let lastError = null;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      console.log(`[Generator] Requesting content generation from Groq... (Attempt ${attempt}/${maxAttempts})`);
      let resultText = '';
      try {
        const response = await callGroqWithRetry({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt.normalize('NFC') },
            { role: 'user', content: userPrompt.normalize('NFC') }
          ],
          temperature: 0.5,
          max_tokens: 6000,
        });
        resultText = (response.choices[0]?.message?.content || '').trim();
        console.log('[Generator] Main model raw response length:', resultText.length);
        if (!resultText) throw new Error("Main model returned empty content");
      } catch (apiError) {
        console.warn('[Generator] Main model failed. Error:', apiError.message || apiError);
        console.warn('[Generator] Falling back to llama-3.1-8b-instant...');
        const response = await callGroqWithRetry({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: systemPrompt.normalize('NFC') },
            { role: 'user', content: userPrompt.normalize('NFC') }
          ],
          temperature: 0.5,
          max_tokens: 3000,
        }, 3, 3000);
        resultText = (response.choices[0]?.message?.content || '').trim();
        if (!resultText) throw new Error("Fallback model returned empty content");
      }

      // Strip markdown code block wrapper if present
      let jsonText = resultText;
      const jsonBlockMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonBlockMatch) {
        jsonText = jsonBlockMatch[1].trim();
      }
      if (!jsonText.startsWith('{')) {
        const firstBrace = jsonText.indexOf('{');
        if (firstBrace >= 0) jsonText = jsonText.substring(firstBrace);
      }

      let resultJson;
      try {
        resultJson = JSON.parse(jsonText);
      } catch (parseError) {
        console.error('[Generator] JSON parse failed. Attempting repair of truncated JSON...');
        let repaired = jsonText.trim();
        const openBraces = (repaired.match(/\{/g) || []).length;
        const closeBraces = (repaired.match(/\}/g) || []).length;
        if (openBraces > closeBraces) {
          repaired += '}'.repeat(openBraces - closeBraces);
        }
        resultJson = JSON.parse(repaired);
      }

      // --- STRICT VALIDATION LAYER ---
      if (!resultJson.card2 || !resultJson.card3) {
        throw new Error("Validation Failed: Missing card2 or card3.");
      }
      
      const c2Str = (resultJson.card2.bullets || []).map(b => b.replace(/<\/?hl>/g, '').trim()).join('');
      const c3Str = (resultJson.card3.bullets || []).map(b => b.replace(/<\/?hl>/g, '').trim()).join('');
      
      if (c2Str.length > 10 && c2Str === c3Str) {
        throw new Error("Validation Failed: Card 2 and Card 3 are perfectly identical (LLM Hallucination).");
      }

      const caption = resultJson.instagram_caption || '';
      const suItDaCount = (caption.match(/수 있습니다/g) || []).length;
      if (suItDaCount >= 3) {
        throw new Error("Validation Failed: Repetitive verb endings ('수 있습니다' > 3 times).");
      }
      
      const sentences = caption.split(/(?<=[.!?])\s+/);
      if (sentences.length > 2) {
        for (let i = 0; i < sentences.length - 1; i++) {
          for (let j = i + 1; j < sentences.length; j++) {
            if (sentences[i].length > 15 && sentences[i] === sentences[j]) {
              throw new Error("Validation Failed: instagram_caption contains exact duplicate sentences.");
            }
          }
        }
      }
      // -------------------------------

      // Force unified theme
      resultJson.template_theme = 'unified';
      resultJson.theme_color = '#3B82F6';

      // 1. Validate & repair length truncations
      resultJson = validateAndRepairContent(resultJson);

      // 2. Recursively sanitize
      resultJson = sanitizeJsonRecursively(resultJson);

      // 3. Finalize caption
      resultJson.instagram_caption = finalizeCaption(resultJson.instagram_caption);

      if (selectedNews && selectedNews.date) {
        resultJson.news_date = selectedNews.date;
      } else {
        const today = new Date();
        resultJson.news_date = `${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`;
      }

      console.log('[Generator] Successfully finalized and cleaned card content.');
      return resultJson;

    } catch (error) {
      lastError = error;
      console.warn(`[Generator] Attempt ${attempt} failed with error: ${error.message}`);
      if (attempt < maxAttempts) {
        console.warn(`[Generator] Retrying...`);
      }
    }
  }
  
  console.error('[Generator] All attempts failed. Throwing last error.');
  throw lastError;
}

module.exports = {
  generateCardContent,
};
