const Groq = require('groq-sdk');
const config = require('../config');

// Initialize Groq client
const groq = new Groq({
  apiKey: config.groqApiKey,
});

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

  // Clean up any multilingual / translation leaks (like Chinese suffix 們, 智慧, Russian/Chinese "This means" glitch)
  clean = clean.replace(/們/g, '들');
  clean = clean.replace(/들들/g, '들'); // Just in case "들們" was generated
  clean = clean.replace(/智慧/g, '지혜');
  clean = clean.replace(/圍/g, '위');
  clean = clean.replace(/Это意味着/g, '이는');
  clean = clean.replace(/这意味着/g, '이는');
  clean = clean.replace(/意味着/g, '의미합니다');
  
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

  // If card2 and card3 have identical bullets (model repetition glitch)
  if (
    result.card2 &&
    result.card3 &&
    JSON.stringify(result.card2.bullets) === JSON.stringify(result.card3.bullets)
  ) {
    console.warn('[Generator] Validation warning: card2 and card3 bullets are identical. Performing auto-repair...');
    result.card3.section_title = '그래서 어떻게 돼?';
    result.card3.bullets = [
      '지출 내역 점검',
      '우대금리 상품 비교',
      '파킹통장 개설 고려'
    ];
  }

  // If card3 and card2 have identical insights
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
  const systemPrompt = `당신은 경제 뉴스를 대중의 눈높이에 맞춰 쉽게 전달하는 경제 오피니언 리더이자 전문 비주얼 콘텐츠 디렉터입니다.
선택된 경제 뉴스를 바탕으로 인스타그램 릴스(Reels) 영상 및 슬라이드 포스트용 3장 카드 뉴스 원고와 이미지 생성 프롬프트, 그리고 인스타그램 본문 멘트를 작성해 주세요.

### 작성 지침:
1. **쉬운 용어 설명 (핵심)**:
   - 어려운 경제 용어는 초보자도 쉽게 알 수 있도록 괄호안에 아주 친절한 설명이나 비유를 붙여주세요.
     (예: "연준(미국의 중앙은행으로 세계 경제의 돈줄을 쥐고 있는 곳)", "LTV(집값 대비 대출한도 - 1억짜리 집이면 최대 얼마까지 대출해줄지 정하는 비율)")
2. **숏폼(릴스) 최적화 극단적 텍스트 다이어트 (필수)**:
   - 릴스 화면에서 시청자의 시선을 1초 만에 사로잡고 즉시 해독될 수 있도록 문장을 절대 길게 쓰지 마십시오.
   - 각 불릿 포인트는 **핵심 키워드와 지표 중심의 초단축 문구(한국어 15자 내외)**로 요약해야 합니다.
   - 불필요한 조사와 서술어는 생략하고, 명사형 종결이나 직관적 키워드 위주로 작성하십시오.
3. **카드 2와 카드 3의 완전 분리 및 실질적 Action 강제 (필수)**:
   - **카드 2(card2)**: 기사 내용의 핵심 팩트(Fact) 요약 3가지입니다. (배지명 추천: "무슨 일이야?")
   - **카드 3(card3)**: 기사 사건이 독자의 지갑에 미칠 영향과 독자가 취해야 할 실생활 행동 지침(Action) 3가지입니다. (배지명 추천: "그래서 어떻게 돼?")
   - **경고**: 카드 3(card3)의 불릿 포인트는 절대로 학술적이거나 거시적인 추상형 개요(예: '은행권 구조조정의 영향', '미래 금융업계의 전망') 또는 너무 당연하고 얄팍한 조언(예: '가계부 예산 세우기', '금리 변동 주시하기', '저금리 대출 찾기', '재테크 관심 갖기')으로 적지 마십시오. 독자가 오늘 이 뉴스를 읽고 당장 스마트폰을 켜거나 은행에 갈 때 실행할 수 있는 **매우 구체적이고 실천 가능한 실생활 행동 지침**으로 적어주세요.
     (예: '우대금리 자동알림 켜기', '상호금융 금리 비교하기', '금리인하요구권 조건 체크')
     각 불릿 포인트는 15자 내외의 구체적인 행동 팁이어야 합니다. 두 카드의 불릿 포인트는 절대 겹치거나 같아서는 안 되며, 완전히 구분되어야 합니다.
4. **에디토리얼 인사이트(editors_insight) 작성**:
   - 가벼워 보이는 말풍선이나 이모티콘 독백 대신, 뉴스 레터 스타일의 **격식 있고 신뢰감 주는 한 줄 요약 평(인사이트)**을 20자 내외의 정중한 어조로 작성하세요. (이모지 남발 금지, 최대 1개)
5. **비주얼 컨셉 및 FLUX 이미지 프롬프트 (로컬라이즈 및 일관성 필수)**:
   - 각 카드에 어울리는 고해상도 FLUX.1-schnell 이미지 생성 프롬프트를 **영어로** 구체적으로 작성하세요.
   - **필수 스타일 제약**: 모든 카드 이미지가 동일한 비주얼 톤앤매너를 유지해야 합니다. 다음 스타일 키워드를 프롬프트에 메인으로 고정 포함하십시오: "Consistent minimalist 3D vector illustration style, cute pastel claymation, isolated on clean solid background, financial theme, no text in image".
   - **로컬라이제이션(한국화) 필수**: 뉴스 내용에 화폐가 등장할 경우 절대 미국 달러(USD)를 묘사하지 말고 **한국 원화(KRW coins, Korean Won bills)**를 묘사하도록 프롬프트를 작성하세요. 인물이나 배경이 나올 경우 반드시 **한국/동아시아적 맥락(Korean context, East Asian characters)**을 묘사하도록 강제하세요.
   - **비주얼 통일성**: 실사 사진이나 노트북, 영문 텍스트 화면 같은 스탁 사진 분위기는 철저히 배제하고, 통일된 3D 그래픽/일러스트 스타일만 생성하도록 프롬프트를 작성하십시오.
6. **디자인 테마 및 강조 색상 선정 (template_theme & theme_color)**:
   - 뉴스의 주제와 분위기에 맞는 디자인 테마를 선정하세요:
     - "obsidian": 정통 거시경제, 금리, 기업 실적, 증시 시황 뉴스용. (추천 theme_color: "#00d2ff" 또는 네온 블루)
     - "ivory": 친근한 실생활 민생 경제, 정책, 부동산, 일반 소비재 뉴스용. (추천 theme_color: "#705d00" 또는 짙은 골드)
     - "cyber": 미래지향적인 반도체, IT, 빅테크, AI, 코인/암호화폐 뉴스용. (추천 theme_color: "#bc13fe" 또는 네온 퍼플)
7. **인스타그램 게시글 멘트 (instagram_caption) - 이모지 및 해시태그 중요**:
   - 줄바꿈과 이모지를 풍부하게 섞어 친근한 해요체로 작성하세요.
   - **중요**: 본문에 들어가는 모든 이모지는 반드시 **👀, 📝, 📈, 🚨, ✅ 같은 실제 유니코드 이모지**로 넣으세요. \`:eyes:\`, \`:memo:\`, \`:rotating_light:\` 같은 Slack 텍스트 코드는 절대로 사용하지 마십시오.
   - 본문 내 해시태그를 길게 나열하는 대신 텍스트 본문만 자연스럽게 생성하십시오. (해시태그는 스크립트 내부에서 깔끔한 한국어 태그로 후처리 삽입할 것입니다)

반드시 마크다운 백틱 없이 순수한 JSON 포맷으로만 응답해야 합니다.

### 응답 JSON 스키마:
{
  "template_theme": "obsidian, ivory, 또는 cyber 중 선택",
  "theme_color": "Hex 컬러 코드 (예: #00d2ff)",
  "card1": {
    "title": "호기심을 유발하는 1장 타이틀 (예: 미국 금리가 내렸다고? 내 대출 이자는?)",
    "subtitle": "타이틀 아래 들어갈 부제목 (예: 미국 연방준비제도의 깜짝 금리 인하 소식)",
    "editors_insight": "20자 내외의 신뢰감 있는 뉴스 브리핑 (예: 연준의 긴급 금리 결정입니다.)",
    "image_prompt": "FLUX 이미지 생성용 영어 프롬프트"
  },
  "card2": {
    "section_title": "무슨 일이야?",
    "bullets": [
      "15자 내외 키워드 팩트 1 (예: 美 인플레이션 2.5% 기록)",
      "15자 내외 키워드 팩트 2 (예: 금리 인하 확률 90% 돌파)",
      "15자 내외 키워드 팩트 3 (예: 뉴욕 증시 최고치 경신)"
    ],
    "editors_insight": "팩트에 대한 한 줄 에디터 평 (예: 본격적인 금리 인하 궤도 진입입니다.)",
    "image_prompt": "FLUX 이미지 생성용 영어 프롬프트"
  },
  "card3": {
    "section_title": "그래서 어떻게 돼?",
    "bullets": [
      "15자 내외 구체적 액션 1 (예: 고금리 예적금 막차 가입)",
      "15자 내외 구체적 액션 2 (예: 고정금리 대환 수수료 계산)",
      "15자 내외 구체적 액션 3 (예: 미국 장기채 ETF 분할 매수)"
    ],
    "editors_insight": "대책에 대한 한 줄 에디터 평 (예: 대출 갈아타기 타이밍을 모니터링하세요.)",
    "image_prompt": "FLUX 이미지 생성용 영어 프롬프트"
  },
  "instagram_caption": "인스타그램 업로드용 긴 글 본문 멘트 (이모지 포함, 영어 번역식 해시태그는 넣지 말 것)"
}`;

  const userPrompt = `### 선택된 뉴스 기사 정보:
제목: ${selectedNews.title}
링크: ${selectedNews.link}
기사 요약: ${selectedNews.summary}

위의 기사 내용을 분석하여 카드 뉴스 원고와 이미지 프롬프트, 인스타그램 멘트를 생성해 주세요.`;

  try {
    console.log('[Generator] Requesting content generation from Groq...');
    let resultText = '';
    
    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });
      resultText = response.choices[0].message.content.trim();
    } catch (apiError) {
      if (apiError.status === 429 || (apiError.message && apiError.message.includes('rate_limit'))) {
        console.warn('[Generator] Rate limit hit on 70B model. Falling back to Llama 3.1 8B...');
        const response = await groq.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        });
        resultText = response.choices[0].message.content.trim();
      } else {
        throw apiError;
      }
    }

    console.log('[Generator] Raw content generated from LLM. Validating & Sanitizing...');
    let resultJson = JSON.parse(resultText);

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
