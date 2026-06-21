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
    
    clean = clean.replace(/<br\s*\/?>/gi, '\n');
    clean = clean.replace(/\n{3,}/g, '\n\n');
    clean = clean.replace(/['"]/g, "'");

    // --- 지능형 '해요체' 변환 정규식 (LLM 할루시네이션 완벽 차단) ---
    clean = clean.replace(/습니다\.$/g, '어요.');
    clean = clean.replace(/합니다\.$/g, '해요.');
    clean = clean.replace(/입니다\.$/g, '이에요.');
    clean = clean.replace(/는다\.$/g, '는데요.');
    clean = clean.replace(/한다\.$/g, '해요.');
    clean = clean.replace(/했다\.$/g, '했어요.');
    clean = clean.replace(/있다\.$/g, '있어요.');
    clean = clean.replace(/없다\.$/g, '없어요.');
    clean = clean.replace(/이다\.$/g, '이에요.');
    clean = clean.replace(/된다\.$/g, '돼요.');
    clean = clean.replace(/것이다\.$/g, '것이에요.');
    clean = clean.replace(/수 있다\.$/g, '수 있어요.');
    clean = clean.replace(/준다\.$/g, '줘요.');
    
    // 명사형 꼬리 변환 및 할루시네이션 오타 후처리
    clean = clean.replace(/원\.$/g, '원이에요.');
    clean = clean.replace(/개\.$/g, '개예요.');
    clean = clean.replace(/명\.$/g, '명이에요.');
    clean = clean.replace(/지정\.$/g, '지정됐어요.');
    clean = clean.replace(/원$/g, '원이에요');
    clean = clean.replace(/개$/g, '개예요');
    clean = clean.replace(/명$/g, '명이에요');
    clean = clean.replace(/지정$/g, '지정됐어요');
    clean = clean.replace(/하요\.$/g, '해요.');
    clean = clean.replace(/하요$/g, '해요');
    clean = clean.replace(/필요하요/g, '필요해요');

    // 위 패턴에 안 걸린 마지막 '다.' 안전하게 치환
    if (clean.endsWith('다.')) {
      clean = clean.substring(0, clean.length - 2) + '요.';
    }

    // 단어가 끝나는 지점('. ' 없이 바로 끝나는 경우)
    clean = clean.replace(/습니다$/g, '어요');
    clean = clean.replace(/합니다$/g, '해요');
    clean = clean.replace(/입니다$/g, '이에요');
    clean = clean.replace(/는다$/g, '는데요');
    clean = clean.replace(/한다$/g, '해요');
    clean = clean.replace(/했다$/g, '했어요');
    clean = clean.replace(/있다$/g, '있어요');
    clean = clean.replace(/없다$/g, '없어요');
    clean = clean.replace(/이다$/g, '이에요');
    clean = clean.replace(/된다$/g, '돼요');
    clean = clean.replace(/것이다$/g, '것이에요');
    clean = clean.replace(/수 있다$/g, '수 있어요');
    clean = clean.replace(/준다$/g, '줘요');
    if (clean.endsWith('다')) {
      clean = clean.substring(0, clean.length - 1) + '요';
    }

    return clean;
  }

  // --- 2. <hl> 태그 강제 이식 및 금지어 덮어쓰기 로직 ---
  function enforceHlTag(text) {
    if (!text || typeof text !== 'string') return text;
    if (text.includes('<hl>')) return text; // 이미 있으면 통과
    
    // <hl>이 없으면 띄어쓰기 기준 가장 긴 단어(조사 제외, 2글자 이상)를 찾아 강제로 씌움
    const words = text.split(' ').filter(w => w.length >= 2 && !w.endsWith('요') && !w.endsWith('요.'));
    if (words.length > 0) {
      const target = words.reduce((a, b) => a.length > b.length ? a : b);
      return text.replace(target, `<hl>${target}</hl>`);
    }
    return `<hl>${text}</hl>`; // 정 안되면 통째로 씌움
  }

  function censorAction(text) {
    if (!text || typeof text !== 'string') return text;
    const banRegex = /(주의|유의|파악|고려|대비|수립|확인|모색|찾아보|알아보|재검토)/;
    if (banRegex.test(text)) {
      return '지금 당장 내 계좌를 열어 1원이라도 손해보고 있는지 점검해보세요! <hl>머뭇거리다간 큰일납니다!</hl>';
    }
    return text;
  }

  // Card 2
  if (result.card2 && Array.isArray(result.card2.bullets)) {
    result.card2.bullets = result.card2.bullets.map(b => enforceHlTag(cleanText(b, 130)));
  }

  // Card 3
  if (result.card3 && Array.isArray(result.card3.bullets)) {
    result.card3.bullets = result.card3.bullets.map(b => enforceHlTag(cleanText(b, 130)));
  }

  // Card 4 (Optional) - Action Card
  if (result.card4 && Array.isArray(result.card4.bullets)) {
    result.card4.bullets = result.card4.bullets.map((b, idx) => {
      let cleaned = cleanText(b, 130);
      if (idx === 1) cleaned = censorAction(cleaned); // 두 번째 불릿(액션) 금지어 덮어쓰기
      return enforceHlTag(cleaned);
    });
  } else if (result.card3 && Array.isArray(result.card3.bullets)) {
    // 만약 Card4가 없고 Card3가 마지막(액션) 카드라면?
    // 이건 프롬프트에서 제어하므로 일단 Card3는 위에서 처리함.
    // 확실하게 Card3의 두 번째 불릿도 액션일 수 있으니 필터링.
    if (result.card3.section_title === "그래서 어떻게 돼?") {
       result.card3.bullets = result.card3.bullets.map((b, idx) => {
         let cleaned = b;
         if (idx === 1) cleaned = censorAction(cleaned);
         return enforceHlTag(cleaned);
       });
    }
  }

  // Core Insight
  if (result.core_insight) {
    let insight = cleanText(result.core_insight, 120);
    const banRegex = /(주의|유의|파악|고려|대비|수립|확인)/;
    if (banRegex.test(insight)) {
      insight = '<hl>내 돈 아니라고 방관하다간 정말 깡통 찰 수 있어요!</hl> 지금 당장 행동하세요.';
    }
    result.core_insight = enforceHlTag(insight);
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

  return result;
}


/**
 * Helper function to execute LLM call and parse JSON safely
 */
async function executeLLMCall(systemPrompt, userPrompt, maxTokens) {
  let attempt = 0;
  const maxAttempts = 3;
  let lastError = null;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      console.log(`[Generator] Requesting LLM generation... (Attempt ${attempt}/${maxAttempts})`);
      let resultText = '';
      try {
        const response = await callGroqWithRetry({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt.normalize('NFC') },
            { role: 'user', content: userPrompt.normalize('NFC') }
          ],
          temperature: 0.6,
          max_tokens: maxTokens,
        });
        resultText = (response.choices[0]?.message?.content || '').trim();
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
          max_tokens: Math.min(maxTokens, 3000),
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
        console.error('[Generator] JSON parse failed. Attempting repair...');
        let repaired = jsonText.trim();
        const openBraces = (repaired.match(/\{/g) || []).length;
        const closeBraces = (repaired.match(/\}/g) || []).length;
        if (openBraces > closeBraces) {
          repaired += '}'.repeat(openBraces - closeBraces);
        }
        resultJson = JSON.parse(repaired);
      }
      return resultJson;
    } catch (error) {
      lastError = error;
      console.warn(`[Generator] Attempt ${attempt} failed with error: ${error.message}`);
    }
  }
  throw lastError;
}

/**
 * Generates the contents for the 3 Instagram slides and the Instagram post caption.
 * @param {{title: string, link: string, pubDate: string, summary: string, fullText: string, imageUrl: string|null}} selectedNews 
 * @returns {Promise<object>}
 */
async function generateCardContent(selectedNews) {
  const systemPromptCards = `당신은 20~30대 밀레니얼/Z세대를 위한 프리미엄 경제 매거진 "오늘경제(today.econ)"의 수석 에디터입니다.
당신의 페르소나는 "날카롭지만 친근하게, 어려운 경제 이면의 인사이트를 쉽게 짚어주는 똑똑한 멘토"입니다.

### 언어 통제 (CRITICAL):
- **[절대 금지] 절대로 일본어(日本語), 중국어 등 한국어 이외의 언어를 섞어 쓰지 마세요.** 오직 100% 한국어(Korean)만 사용해야 합니다.
- **[절대 금지] 법안명, 대출명, 상품명 등 고유명사를 절대 임의로 줄여 쓰지 마세요. (예: 불법사금융예방대출 -> 불사금예방대출 금지)**

### 톤앤매너 (CRITICAL):
- **캐주얼하지만 가볍지 않은 반존대(해요체)**를 반드시 사용하세요. (예: "~거든요", "~인데요", "~이래요", "~했어요", "~더라고요", "~죠", "~있어요")
- **[절대 금지] 절대로 "~다.", "~한다.", "~음/함" 같은 딱딱한 문어체나 기사체를 쓰지 마세요. 문장 끝은 무조건 "해요", "있어요", "돼요" 등으로 끝나야 합니다.**
- "초등학생 수준"으로 유치하게 쓰지 마세요. 독자는 똑똑하지만 경제 용어만 낯선 2030 직장인입니다.
- **피로도 감소 (대명사 활용)**: 매 슬라이드마다 "주택담보대출과 신용대출을 함께 이용하는 차주" 같은 긴 명사구를 앵무새처럼 반복하지 마세요. "이런 분들은", "이 경우" 등 대명사를 활용하여 세련되게 문맥을 이어가세요.

### 생성 과정 (Chain of Thought):
JSON 응답을 생성할 때, 반드시 "analysis" 객체를 먼저 작성하여 기사를 딥다이브 하세요.
그 다음 "cards" 객체를 작성하세요.

1. **분석 (analysis)**:
   - 기사의 표면적 팩트와 이면의 우려를 철저히 분석.

2. **카드 작성 (cards)**:
   - **image_prompt**: AI 배경 이미지를 만들기 위한 영문 프롬프트. 기괴한 사람이나 기계, 세탁기 같은 사실적인 묘사는 절대 금지합니다. 기사의 맥락을 은유적으로 담은 **"추상적이고 하이엔드 3D 아트 (예: A cinematic 3D abstract render of a crumbling golden coin in a dark abyss)"** 스타일로 프롬프트를 영어로 작성하세요.
   - **core_insight**: 카드 전체를 관통하는 정곡을 찌르는 팩트폭행 1~2문장 카피라이팅. 기사 요약 절대 금지. **친구의 뼈를 때리는 수준의 매운맛 도발 1문장**으로 작성하세요. **[CRITICAL: 마지막 카드(액션)의 불릿 포인트와 단어 하나라도 겹치면 안 됩니다. 완전히 다른 시각의 에디터 코멘트로 작성하세요]**
   - **card1 (표지)**: 스크롤을 멈추게 하는 날카로운 질문이나 역설적 상황. **[반드시 25자 이내의 짧고 자극적인 1문장 훅으로 작성하세요]**
   - **card2, card3 (무슨 일이야?)**: 기사의 핵심 팩트를 서술형으로 상세하게 설명. 내용이 길면 card2와 card3로 나누어서 작성하세요. (내용이 짧으면 card3를 생략하고 바로 마지막 카드로 넘어가도 됩니다)
   - **card4 (그래서 어떻게 돼?)**: (만약 card3가 팩트라면 card4가 액션 카드가 됩니다. card3가 생략되었다면 card3가 액션 카드가 됩니다.)
     * 첫 번째 불릿: 내 지갑과 실생활에 미치는 진짜 영향을 **자연스러운 서술형**으로 작성하세요. (접두어 사용 금지)
     * 두 번째 불릿: 당장 실천할 수 있는 구체적인 행동 지침이나 대비책을 "~해보세요" 형태로 작성하세요. **[금지어: 주의하세요, 파악하세요, 고려하세요, 대비하세요, 수립하세요]** 이런 뻔한 훈수 절대 금지. "보유 중인 동전주가 있다면 다음 달 1일 전에 매도 타이밍을 잡으세요" 처럼 당장 앱을 켜고 할 수 있는 초구체적이고 실무적인 팁을 줄 것. (접두어 사용 금지)
   - **hard_terms (용어 해설)**: 각 팩트/액션 카드에서 어려운 용어를 뽑아 해설합니다. **사전적 정의 절대 금지. 반드시 실생활 사물이나 상황에 빗댄 비유로만 설명하세요. [예시: 시가총액 = 이 회사를 통째로 살 때 영수증에 찍히는 가격표 같은 거예요]**

### 불릿 포인트 작성 규칙:
- **1개의 불릿은 무조건 60자 이내**로 작성하세요. 내용이 길면 절대 한 줄에 욱여넣지 말고, 불릿의 개수를 늘려서 쪼개세요.
- **모든 불릿에는 반드시 1개 이상의 '<hl>핵심 키워드</hl>' 태그가 포함되어야 합니다.** (예외 없음)
- 기계적인 키워드 나열 절대 금지. 완전한 문장 구조(해요체 서술어 포함) 유지.

반드시 마크다운 백틱 없이 순수한 JSON 포맷으로만 응답하세요.
{
  "analysis": {
    "paradox": "기사 내용 중 겉과 속이 다른 모순점",
    "real_impact": "독자에게 미치는 진짜 영향"
  },
  "cards": {
    "image_prompt": "Cinematic dark 3D render of...",
    "core_insight": "전체를 관통하는 에디터의 날카로운 한 문장 (<hl>태그</hl> 활용)",
    "card1": {
      "title": "25자 이내의 짧고 강렬한 훅 (강조: <hl>태그</hl>, 줄바꿈: \\n)",
      "subtitle": "타이틀 보충 (1줄)"
    },
    "card2": {
      "section_title": "무슨 일이야?",
      "bullets": [ "상세한 서술형 팩트 1", "상세한 서술형 팩트 2" ],
      "hard_terms": [ { "term": "용어", "explanation": "쉬운 비유" } ]
    },
    "card3": {
      "section_title": "무슨 일이야?",
      "bullets": [ "상세한 서술형 팩트 3", "상세한 서술형 팩트 4" ],
      "hard_terms": [ { "term": "용어", "explanation": "쉬운 비유" } ]
    },
    "card4": {
      "section_title": "그래서 어떻게 돼?",
      "bullets": [ "내 지갑에 미치는 영향 상세 설명", "구체적인 대비책이나 액션 아이템" ],
      "hard_terms": []
    }
  }
}`;

  const userPromptCards = `### 뉴스 기사 본문:
제목: ${selectedNews.title}
기사 내용: ${selectedNews.fullText || selectedNews.summary}

위 기사를 깊이 있게 분석하여, 표면적인 현상 이면의 진짜 의미를 살려 카드뉴스 원고를 생성해 주세요.`;

  console.log('[Generator] Step 1: Generating Deep Analysis and Cards...');
  let cardsResult = await executeLLMCall(systemPromptCards, userPromptCards, 6000);
  
  if (!cardsResult.cards) {
    throw new Error("Validation Failed: LLM did not return 'cards' object.");
  }

  let resultJson = cardsResult.cards;
  resultJson.analysis = cardsResult.analysis;

  console.log('[Generator] Pausing 4s before generating caption to avoid rate limits...');
  await new Promise(r => setTimeout(r, 4000));

  const systemPromptCaption = `당신은 경제 매거진 "오늘경제"의 수석 에디터입니다.
작성된 카드뉴스 원고를 바탕으로, 인스타그램 피드에 올릴 본문 캡션을 작성해주세요.

### 캡션 작성 규칙 (CRITICAL):
- **[CRITICAL] 반드시 유효한 순수 JSON 객체 포맷으로만 응답하세요.** 마크다운 백틱(\`\`\`)이나 추가적인 설명을 덧붙이면 절대 안 됩니다.
- **날카롭지만 친근하게**: "혹시 이거 아셨어요?", "다들 호황이라는데 내 지갑은 왜 이럴까요?" 처럼 독자의 공감을 이끌어내는 오프닝.
- 원고에 담긴 핵심 모순점과 진짜 인사이트를 2~3문장으로 짚어주세요.
- 지나친 스팸성/광고성 멘트 절대 금지.
- 이모지를 적절히 사용하되, <hl> 태그는 쓰지 마세요.
- 해시태그는 넣지 마세요 (자동 추가됨).
- **응답 포맷 예시**: 
{
  "instagram_caption": "혹시 이거 아셨어요? 다들 대출받기 바쁜데 금리는 오른다고 하니 한숨만 나오죠 😥..."
}`;

  const userPromptCaption = `### 카드뉴스 원고:
${JSON.stringify(resultJson, null, 2)}

이 원고를 바탕으로 독자가 댓글을 달고 싶어지는 매력적이고 인사이트 넘치는 인스타그램 캡션을 작성해주세요.`;

  console.log('[Generator] Step 2: Generating Instagram Caption...');
  let captionResult = await executeLLMCall(systemPromptCaption, userPromptCaption, 2000);
  resultJson.instagram_caption = captionResult.instagram_caption || '';

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
}

module.exports = {
  generateCardContent,
};
