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
  
  const emojiMap = {
    ':chart_with_upwards_trend:': '📈',
    ':mega:': '📢',
    ':eyes:': '👀',
    ':memo:': '📝',
    ':white_check_mark:': '✅',
    ':warning:': '🚨',
    ':rotating_light:': '🚨',
    ':bulb:': '💡',
    ':thinking:': '🧐',
    ':thinking_face:': '🤔',
    ':moneybag:': '💰',
    ':money_with_wings:': '💸',
    ':exploding_head:': '🤯',
    ':bar_chart:': '📊',
    ':scissors:': '✂️',
    ':shield:': '🛡️',
    ':lock:': '🔒',
    ':smile:': '😄',
    ':fire:': '🔥',
    ':rocket:': '🚀',
    ':checkered_flag:': '🏁',
    ':point_right:': '👉',
    ':point_left:': '👈',
    ':star:': '⭐️',
    ':heart:': '❤️',
    ':sob:': '😭',
    ':tada:': '🎉',
  };
  
  let clean = text;
  
  // Replace Slack shortcode emojis with real Unicode emojis
  for (const [shortcode, emoji] of Object.entries(emojiMap)) {
    clean = clean.replace(new RegExp(shortcode, 'g'), emoji);
  }

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
  
  // Append highly-curated professional Korean financial hashtags
  const standardHashtags = '\n\n#재테크 #경제공부 #경제뉴스 #오늘의경제 #직장인재테크 #재테크초보 #today_econ';
  clean += standardHashtags;
  
  return clean;
}

/**
 * Validates and repairs the card JSON content to prevent repetition errors of Llama 3.1 8B.
 */
function validateAndRepairContent(jsonData) {
  const result = { ...jsonData };

  function cleanText(text, maxLength, isActionCard = false) {
    if (typeof text !== 'string') return text;
    let clean = text.trim().normalize('NFC');
    
    // Remove common emojis at the beginning
    clean = clean.replace(/^[\uD800-\uDBFF][\uDC00-\uDFFF]\s*/, '');
    clean = clean.replace(/^💡\s*/, '');
    clean = clean.replace(/^[-•*▶▷✓✅☑]\s*/, '');

    // Stripping Korean subject fluff
    clean = clean.replace(/^한국\s*(기업|정부|투자자)는?\s*/g, '');
    clean = clean.replace(/^미국의?\s*/g, '');
    
    if (!isActionCard) {
      // Ending verb forms -> noun/action forms (only for fact cards)
      clean = clean.replace(/대비해야함$/g, '대비');
      clean = clean.replace(/대책을\s*검토해야함$/g, '대책 마련');
      clean = clean.replace(/검토해야함$/g, '검토');
      clean = clean.replace(/개선\s*필요$/g, '개선');
      clean = clean.replace(/마련해야함$/g, '마련');
      clean = clean.replace(/마련해야\s*함$/g, '마련');
      clean = clean.replace(/해결해야함$/g, '해결');
      clean = clean.replace(/대비해야\s*함$/g, '대비');
      clean = clean.replace(/필요함$/g, '필요');
      clean = clean.replace(/요구됨$/g, '요구');
      clean = clean.replace(/전망됨$/g, '전망');
      clean = clean.replace(/우려됨$/g, '우려');
    }

    // Remove double spaces
    clean = clean.replace(/\s+/g, ' ').trim();

    if (clean.length > maxLength) {
      clean = clean.substring(0, maxLength);
    }
    return clean;
  }

  // Card 2
  if (result.card2 && Array.isArray(result.card2.bullets)) {
    result.card2.bullets = result.card2.bullets.map(b => cleanText(b, 45, false)); // Slightly increased for tags
  }
  if (result.card2 && result.card2.editors_insight) {
    result.card2.editors_insight = cleanText(result.card2.editors_insight, 50, false);
  }

  // Card 3
  if (result.card3 && Array.isArray(result.card3.bullets)) {
    result.card3.bullets = result.card3.bullets.map(b => cleanText(b, 45, true));
  }
  if (result.card3 && result.card3.editors_insight) {
    result.card3.editors_insight = cleanText(result.card3.editors_insight, 50, true);
  }

  // Card 1
  if (result.card1 && result.card1.editors_insight) {
    result.card1.editors_insight = cleanText(result.card1.editors_insight, 50, false);
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
      '내 지출 내역부터 당장 점검하세요!',
      '은행별 우대금리를 꼼꼼히 비교해보세요',
      '주거래 은행의 숨은 혜택을 찾아보세요'
    ];
  }

  // Dedup words within insights
  if (
    result.card2 &&
    result.card3 &&
    result.card2.editors_insight === result.card3.editors_insight
  ) {
    result.card3.editors_insight = '가계 지출 관리를 철저히 모니터링해야 합니다.';
  }

  return result;
}

/**
 * Generates the contents for the 3 Instagram slides and the Instagram post caption.
 * @param {{title: string, link: string, pubDate: string, summary: string}} selectedNews 
 * @returns {Promise<{
 *   template_theme: string,
 *   theme_color: string,
 *   card1: { title: string, subtitle: string, editors_insight: string, image_prompt: string },
 *   card2: { section_title: string, bullets: Array<string>, editors_insight: string, image_prompt: string },
 *   card3: { section_title: string, bullets: Array<string>, editors_insight: string, image_prompt: string },
 *   instagram_caption: string
 * }>}
 */
async function generateCardContent(selectedNews) {
  const titleAndSummary = (((selectedNews && selectedNews.title) || '') + ' ' + ((selectedNews && selectedNews.summary) || '')).toLowerCase();
  const isIndustrial = /원전|발전|수주|매출|수출|에너지|배터리|반도체|중공업|건설|조선|철강|석유|화학|태양광|풍력|수소|대출|금융|은행|증시|금리|증권|투자|아람코|사우디|관세|통상|무역/.test(titleAndSummary);

  const systemPrompt = `당신은 경제 뉴스를 대중의 눈높이에 맞춰 쉽게 전달하는 경제 오피니언 리더이자 전문 비주얼 콘텐츠 디렉터입니다.
선택된 경제 뉴스를 바탕으로 인스타그램 릴스(Reels) 영상 및 슬라이드 포스트용 3장 카드 뉴스 원고와 이미지 생성 프롬프트, 그리고 인스타그램 본문 멘트를 작성해 주세요.

### 작성 지침:
1. **태그 기반 동적 타이포그래피 강조 (필수)**:
   - 기사의 핵심 키워드, 중요한 수치, 금액, 고유명사(예: '2조 원', '사우디 자푸라', '아람코' 등)는 텍스트(타이틀, 서브타이틀, 불릿, 에디터 인사이트 모두 포함) 내에서 반드시 \`<hl>강조텍스트</hl>\` 태그로 감싸주세요.
   - 예시: "사우디 <hl>자푸라 2단계</hl> 발전소 수주", "<hl>한전 2조원</hl> 매출 기대"
2. **쉬운 용어 설명**:
   - 어려운 경제 용어는 초보자도 쉽게 알 수 있도록 괄호안에 아주 친절한 설명이나 비유를 붙여주세요.
     (예: "연준(미국의 중앙은행으로 세계 경제의 돈줄을 쥐고 있는 곳)", "LTV(집값 대비 대출한도 - 1억짜리 집이면 최대 얼마까지 대출해줄지 정하는 비율)")
3. **숏폼(릴스) 최적화 극단적 텍스트 다이어트 (필수)**:
   - 릴스 화면에서 시청자의 시선을 1초 만에 사로잡고 즉시 해독될 수 있도록 문장을 절대 길게 쓰지 마십시오.
   - 각 불릿 포인트는 **핵심 키워드와 지표 중심의 초단축 문구(한국어 15자 내외)**로 요약해야 합니다.
   - 불필요한 조사와 서술어는 생략하고, 명사형 종결이나 직관적 키워드 위주로 작성하십시오.
4. **카드 2와 카드 3의 완전 분리 및 실질적 Action 강제 (필수)**:
   - **카드 2(card2)**: 기사 내용의 핵심 팩트(Fact) 요약 3가지입니다. (배지명 추천: "무슨 일이야?")
   - **카드 3(card3)**: 기사 사건이 독자의 지갑에 미칠 영향과 독자가 취해야 할 실생활 행동 지침(Action) 3가지입니다. (배지명 추천: "그래서 어떻게 돼?")
   - **카피라이팅 톤앤매너 변경 (Actionable CTA)**: 카드 3(card3)의 불릿 포인트와 에디터 평은 절대로 건조한 명사형 요약이나 나열(예: 'IR 자료 바로 확인', '해외 전력 투자 검토')로 작성하지 마십시오. 유저에게 직접 말을 거는 듯한 행동 유도(CTA) 문장(예: "<hl>지금 당장 DART에서 IR 자료를 열어보세요!</hl>", "<hl>내 계좌의 에너지 섹터 비중</hl>, 지금이 점검할 타이밍입니다!")으로 역동적인 톤앤매너를 변환하여 작성하십시오.
     각 불릿 포인트는 20자 내외의 구체적인 행동 팁이어야 합니다. 두 카드의 불릿 포인트는 절대 겹치거나 같아서는 안 되며, 완전히 구분되어야 합니다.
5. **에디토리얼 인사이트(editors_insight) 작성**:
   - 가벼워 보이는 말풍선이나 이모티콘 독백 대신, 뉴스 레터 스타일의 **격식 있고 신뢰감 주는 한 줄 요약 평(인사이트)**을 20자 내외의 정중한 어조로 작성하세요. (이모지 남발 금지, 최대 1개)
   - **중요**: 해당 카드의 제목이나 불릿 포인트에 사용된 텍스트를 그대로 반복하지 마십시오. 예를 들어, 불릿이 "2500억 펀드 조성"이면 인사이트는 "중소기업의 설비 자금난이 해소될 전망입니다"와 같이 **원인 분석, 영향력, 혹은 거시적 경제 전망**으로 완전히 다르게 서술해야 합니다. 단어를 그대로 재활용하여 대충 만든 인상을 주는 행위를 엄격히 금지합니다.
6. **비주얼 컨셉 및 FLUX 이미지 프롬프트 (로컬라이즈 및 일관성 필수)**:
   - 각 카드에 어울리는 고해상도 FLUX.1-schnell 이미지 생성 프롬프트를 **반드시 순수한 영어로만 (NO KOREAN)** 구체적으로 작성하세요.
   - **필수 스타일 제약**: 모든 카드 이미지가 동일한 비주얼 톤앤매너를 유지해야 합니다. 다음 스타일 키워드를 프롬프트에 메인으로 고정 포함하십시오: "Consistent minimalist 3D vector illustration style, cute pastel claymation, isolated on clean solid background, financial theme, no text in image".
   - **글자 생성 절대 금지**: 이미지 내부에 'REVENUE', 'BUSINESS', 'MONEY' 등 어떠한 영어 단어/문자도 렌더링되게 유도하지 마십시오. 글자가 나타날 수 있는 노트북 모니터나 스마트폰 화면, 차트의 레이블 등은 표현하지 마십시오. (no english letters, no characters, no alphabet)
   - **로컬라이제이션(한국화) 필수**: 뉴스 내용에 화폐가 등장할 경우 절대 미국 달러(USD)나 유로 등을 묘사하지 말고 **한국 원화(KRW coins, Korean Won bills with green color and King Sejong portrait)**를 묘사하도록 프롬프트를 작성하세요. 인물이나 배경이 나올 경우 반드시 **한국/동아시아적 맥락(Korean context, East Asian characters)**을 묘사하도록 강제하세요.
   - **비주얼 통일성 및 1차원 매칭 회피**: 실사 사진이나 노트북, 스톡 사진 분위기는 철저히 배제하십시오. 뉴스 팩트를 너무 1차원적으로 묘사하여 재미없게 그리지 마십시오. 뉴스 핵심 개념을 3D 클레이 장난감 피규어 소품 형태로 비유적으로 창의성 있게 묘사하십시오.
   - **도메인 맞춤 라우팅 및 톤앤매너 강제 (CRITICAL)**: 뉴스 주제가 '산업', '에너지', '금융', '중공업', '건설' 등에 해당한다면, 뷰티 채널에 어울릴 법한 "추상적인 마블링, 스모크 그래픽, 화려한 형형색색의 질감"은 절대 프롬프트에 묘사되지 않도록 강하게 네거티브 제약(negative constraints)을 거십시오. 대신 "묵직하고 쨍한 명암비(High-contrast)를 살린 인더스트리얼(Industrial Noir) 풍"이나 "신뢰감을 주는 다크 코퍼레이트(Dark Corporate) 테마"를 이미지 프롬프트에 강제 주입하십시오.
7. **디자인 테마 및 강조 색상 선정 (template_theme & theme_color)**:
   - 뉴스의 주제와 분위기에 맞는 디자인 테마를 선정하세요:
     - "obsidian": 정통 거시경제, 금리, 기업 실적, 증시 시황 뉴스용. (추천 theme_color: "#00d2ff" 또는 네온 블루)
     - "ivory": 친근한 실생활 민생 경제, 정책, 부동산, 일반 소비재 뉴스용. (추천 theme_color: "#705d00" 또는 짙은 골드)
     - "cyber": 미래지향적인 반도체, IT, 빅테크, AI, 코인/암호화폐 뉴스용. (추천 theme_color: "#bc13fe" 또는 네온 퍼플)
8. **인스타그램 게시글 멘트 (instagram_caption) - 이모지 및 해시태그 중요**:
   - 줄바꿈과 이모지를 풍부하게 섞어 친근한 해요체로 작성하세요.
   - **중요**: 본문에 들어가는 모든 이모지는 반드시 **👀, 📝, 📈, 🚨, ✅ 같은 실제 유니코드 이모지**로 넣으세요. \`:eyes:\`, \`:memo:\`, \`:rotating_light:\` 같은 Slack 텍스트 코드는 절대로 사용하지 마십시오.
   - 본문 내 해시태그를 길게 나열하는 대신 텍스트 본문만 자연스럽게 생성하십시오. (해시태그는 스크립트 내부에서 깔끔한 한국어 태그로 후처리 삽입할 것입니다)
9. **콘텐츠 중복 절대 금지 규칙 (CRITICAL)**:
   - 'card1.title', 'card1.editors_insight', 'card2.bullets', 'card2.editors_insight', 'card3.bullets', 'card3.editors_insight' 각 영역 간의 동일한 핵심 단어나 핵심 수식어구의 중복/반복 노출을 철저히 금지합니다.
   - 각 영역은 반드시 아래와 같이 완전히 독립적인 관점과 깊이의 원고로 구성되어야 합니다.

반드시 마크다운 백틱 없이 순수한 JSON 포맷으로만 응답해야 합니다.

### 응답 JSON 스키마:
{
  "template_theme": "obsidian, ivory, 또는 cyber 중 선택",
  "theme_color": "Hex 컬러 코드 (예: #00d2ff)",
  "card1": {
    "title": "호기심을 유발하는 1장 타이틀 (강조 단어는 반드시 <hl>태그</hl> 활용. 예: 미국 <hl>금리인하</hl> 단행, 내 대출은?)",
    "subtitle": "타이틀 아래 들어갈 부제목",
    "editors_insight": "20자 내외의 신뢰감 있는 뉴스 브리핑 (강조 단어는 반드시 <hl>태그</hl> 활용)",
    "image_prompt": "FLUX 이미지 생성용 영어 프롬프트"
  },
  "card2": {
    "section_title": "무슨 일이야?",
    "bullets": [
      "15자 내외 키워드 팩트 1 (강조 단어는 반드시 <hl>태그</hl> 활용. 예: 美 인플레이션 <hl>2.5%</hl> 기록)",
      "15자 내외 키워드 팩트 2 (강조 단어는 반드시 <hl>태그</hl> 활용)",
      "15자 내외 키워드 팩트 3 (강조 단어는 반드시 <hl>태그</hl> 활용)"
    ],
    "editors_insight": "팩트에 대한 한 줄 에디터 평 (강조 단어는 반드시 <hl>태그</hl> 활용)",
    "image_prompt": "FLUX 이미지 생성용 영어 프롬프트"
  },
  "card3": {
    "section_title": "그래서 어떻게 돼?",
    "bullets": [
      "22자 내외 구체적인 행동 유도 CTA 1 (반드시 동사형으로 종결. 예: <hl>관세율 바로 확인</hl>하고 대책 세우세요!)",
      "22자 내외 구체적인 행동 유도 CTA 2 (반드시 동사형으로 종결. 예: <hl>수입 계약 조건</hl>을 즉시 재검토하세요!)",
      "22자 내외 구체적인 행동 유도 CTA 3 (반드시 동사형으로 종결. 예: <hl>대체 수입선</hl>을 당장 모색해 보세요!)"
    ],
    "editors_insight": "대책에 대한 행동 유도 에디터 평 (강조 단어는 반드시 <hl>태그</hl> 활용. 예: <hl>리스크 관리</hl>를 지금 시작해야 합니다)",
    "image_prompt": "FLUX 이미지 생성용 영어 프롬프트"
  },
  "instagram_caption": "인스타그램 업로드용 긴 글 본문 멘트 (이모지 포함, 영어 번역식 해시태그는 넣지 말 것)"
}`;

  let userPrompt = `### 선택된 뉴스 기사 정보:
제목: ${selectedNews.title}
링크: ${selectedNews.link}
기사 요약: ${selectedNews.summary}

위의 기사 내용을 분석하여 카드 뉴스 원고와 이미지 프롬프트, 인스타그램 멘트를 생성해 주세요.`;

  if (isIndustrial) {
    userPrompt += `\n\n### [CRITICAL DESIGN OVERRIDE]: 이 뉴스는 산업/에너지/수주/매출/금융 도메인에 해당합니다.
1. "template_theme"은 반드시 "obsidian"으로 고정하고 "theme_color"는 "#00d2ff"로 하십시오.
2. 각 카드의 이미지 생성 프롬프트(image_prompt)에는 "cute pastel claymation", "colorful liquid", "pastel colors" 같은 부드럽거나 화려한 파스텔조의 형형색색 묘사를 절대 포함하지 마십시오.
3. 대신 "Consistent minimalist 3D vector illustration style, high-contrast industrial noir theme, metallic steel gray and dark navy background, clean solid background, financial/industrial theme, no text in image, dramatic cinematic lighting"과 같은 묵직하고 명도 대비가 높은 인더스트리얼 테마를 강제 주입해 영어 프롬프트를 작성하십시오.`;
  }

  try {
    console.log('[Generator] Requesting content generation from Groq...');
    let resultText = '';
    
    try {
      const response = await callGroqWithRetry({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: systemPrompt.normalize('NFC') },
          { role: 'user', content: userPrompt.normalize('NFC') }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 3000,
      });
      resultText = response.choices[0].message.content.trim();
    } catch (apiError) {
      console.warn('[Generator] 70B/120B failed or rate-limited. Error:', apiError);
      console.warn('[Generator] Falling back to Llama 3.1 8B with low max_tokens...');
      const response = await callGroqWithRetry({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt.normalize('NFC') },
          { role: 'user', content: userPrompt.normalize('NFC') }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 800, // Fit within 6000 TPM limit
      }, 3, 3000);
      resultText = response.choices[0].message.content.trim();
    }

    console.log('[Generator] Raw content generated from LLM. Validating & Sanitizing...');
    let resultJson = JSON.parse(resultText);

    // If it's industrial, double check we force obsidian/cyber
    if (isIndustrial) {
      resultJson.template_theme = 'obsidian';
      resultJson.theme_color = '#00d2ff';
    }

    // 1. Validate & repair potential duplicate content bugs
    resultJson = validateAndRepairContent(resultJson);

    // 2. Recursively sanitize all text fields (including titles, subtitles, bullets, bubbles)
    resultJson = sanitizeJsonRecursively(resultJson);

    // 3. Finalize and sanitize the Instagram caption separately (handling hashtags)
    resultJson.instagram_caption = finalizeCaption(resultJson.instagram_caption);

    console.log('[Generator] Successfully finalized and cleaned card content.');
    return resultJson;
  } catch (error) {
    console.error('[Generator] Failed to generate card content:', error);
    throw error;
  }
}

module.exports = {
  generateCardContent,
};
