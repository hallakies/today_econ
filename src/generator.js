const Groq = require('groq-sdk');
const config = require('../config');

// Initialize Groq client
const groq = new Groq({
  apiKey: config.groqApiKey,
});

/**
 * Sanitizes and cleans the generated Instagram caption to ensure correct unicode emojis and clean hashtags.
 */
function sanitizeCaption(caption) {
  const emojiMap = {
    ':chart_with_upwards_trend:': '📈',
    ':mega:': '📢',
    ':eyes:': '👀',
    ':memo:': '📝',
    ':white_check_mark:': '✅',
    ':warning:': '🚨',
    ':bulb:': '💡',
    ':thinking:': '🧐',
    ':moneybag:': '💸',
    ':scissors:': '✂️',
    ':shield:': '🛡️',
    ':lock:': '🔒',
  };
  
  let clean = caption || '';
  
  // Replace Slack shortcode emojis with real Unicode emojis
  for (const [shortcode, emoji] of Object.entries(emojiMap)) {
    clean = clean.replace(new RegExp(shortcode, 'g'), emoji);
  }

  // Clean up any multilingual contamination (e.g. Russian/Chinese "This means" glitch)
  clean = clean.replace(/Это意味着/g, '이는');
  clean = clean.replace(/这意味着/g, '이는');
  clean = clean.replace(/意味着/g, '의미합니다');
  clean = clean.replace(/智慧/g, '지혜');

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
      '고물가/고금리에 대처할 수 있도록 가계 지출 현황을 먼저 점검해 보세요.',
      '금리 변동이 큰 시기이므로 무리한 대출이나 투자는 신중하게 결정해야 합니다.',
      '매일 올라오는 유용한 경제 시황을 구독하고 스마트한 재테크 전략을 세우세요!'
    ];
  }

  // If card3 and card2 have identical speech bubbles
  if (
    result.card2 &&
    result.card3 &&
    result.card2.speech_bubble === result.card3.speech_bubble
  ) {
    result.card3.speech_bubble = '지갑 절대 지켜! 🛡️';
  }

  return result;
}

/**
 * Generates the contents for the 3 Instagram slides and the Instagram post caption.
 * @param {{title: string, link: string, pubDate: string, summary: string}} selectedNews 
 * @returns {Promise<{
 *   template_theme: string,
 *   theme_color: string,
 *   card1: { title: string, subtitle: string, speech_bubble: string, image_prompt: string },
 *   card2: { section_title: string, bullets: Array<string>, speech_bubble: string, image_prompt: string },
 *   card3: { section_title: string, bullets: Array<string>, speech_bubble: string, image_prompt: string },
 *   instagram_caption: string
 * }>}
 */
async function generateCardContent(selectedNews) {
  const systemPrompt = `당신은 경제 뉴스를 대중의 눈높이에 맞춰 쉽게 전달하는 스타 인플루언서이자 비주얼 콘텐츠 디렉터입니다.
선택된 경제 뉴스를 바탕으로 인스타그램 릴스/슬라이드 포스트용 3장 카드 뉴스 원고와 이미지 생성 프롬프트, 그리고 인스타그램 본문 멘트를 작성해 주세요.

### 작성 지침:
1. **쉬운 용어 설명 (핵심)**:
   - 기사에 쓰인 어려운 경제 용어는 초보자도 쉽게 알 수 있도록 괄호안에 아주 친절한 설명이나 비유를 붙여주세요.
     (예: "연준(미국의 중앙은행으로 세계 경제의 돈줄을 쥐고 있는 곳)", "LTV(집값 대비 대출한도 - 1억짜리 집이면 최대 얼마까지 대출해줄지 정하는 비율)")
2. **짧고 직관적인 카드 뉴스 텍스트**:
   - 한 장의 카드는 스마트폰 화면에서 3~5초 내에 읽힐 수 있도록 극도로 핵심만 추려야 합니다.
   - 각 불릿 포인트는 한 줄당 25자 내외로 간결하게 끊어 작성해 주세요.
3. **카드 2와 카드 3의 완전 분리 (필수)**:
   - **카드 2(card2)**: 기사 내용의 핵심 팩트(Fact) 요약 3가지입니다. (배지명 추천: "무슨 일이야?")
   - **카드 3(card3)**: 기사 사건이 독자의 지갑에 미칠 영향과 독자가 취해야 할 실생활 행동 지침(Action) 3가지입니다. (배지명 추천: "그래서 어떻게 돼?")
   - 두 카드의 불릿 포인트는 절대 겹치거나 같아서는 안 되며, 완전히 구분되어야 합니다.
4. **비주얼 컨셉 및 FLUX 이미지 프롬프트**:
   - 각 카드에 어울리는 고해상도 FLUX.1-schnell 이미지 생성 프롬프트를 **영어로** 구체적으로 작성하세요.
   - 프롬프트 지침: "Minimalist modern 3D vector illustration, cute pastel claymation style, isolated on clean solid background, financial theme, no text in image" 스타일을 차용하여 기사 주제에 맞게 변경하세요. 텍스트가 절대 이미지 안에 들어가지 않도록 "no text"를 필수 포함하세요.
5. **캐릭터 말풍선 멘트 (speech_bubble)**:
   - 각 카드 이미지 위에 들어갈 캐릭터 리액션 말풍선 문구를 10~15자 내외의 아주 위트 있고 직관적인 한국어 한마디로 작성하세요. (각 카드별로 리액션이 겹치지 않게 하세요!)
     (예: "대출 이자 살려줘~", "예금 탈출 신호인가?!", "내 지갑 방어 완료!")
6. **디자인 테마 및 강조 색상 선정 (template_theme & theme_color)**:
   - 뉴스의 주제와 분위기에 맞는 디자인 테마를 선정하세요:
     - "obsidian": 정통 거시경제, 금리, 기업 실적, 증시 시황 뉴스용. (추천 theme_color: "#00d2ff" 또는 네온 블루)
     - "ivory": 친근한 실생활 민생 경제, 정책, 부동산, 일반 소비재 뉴스용. (추천 theme_color: "#705d00" 또는 짙은 골드)
     - "cyber": 미래지향적인 반도체, IT, 빅테크, AI, 코인/암호화폐 뉴스용. (추천 theme_color: "#bc13fe" 또는 네온 퍼플)
7. **인스타그램 게시글 멘트 (instagram_caption) - 이모지 및 해시태그 중요**:
   - 줄바꿈과 이모지를 풍부하게 섞어 친근한 해요체로 작성하세요.
   - **중요**: 본문에 들어가는 모든 이모지는 반드시 **👀, 📝, 📈, 🚨, ✅ 같은 실제 유니코드 이모지**로 넣으세요. \`:eyes:\`, \`:memo:\` 같은 Slack 텍스트 코드는 절대로 사용하지 마십시오.
   - 본문 내 해시태그를 길게 나열하는 대신 텍스트 본문만 자연스럽게 생성하십시오. (해시태그는 스크립트 내부에서 깔끔한 한국어 태그로 후처리 삽입할 것입니다)

반드시 마크다운 백틱 없이 순수한 JSON 포맷으로만 응답해야 합니다.

### 응답 JSON 스키마:
{
  "template_theme": "obsidian, ivory, 또는 cyber 중 선택",
  "theme_color": "Hex 컬러 코드 (예: #00d2ff)",
  "card1": {
    "title": "호기심을 유발하는 1장 타이틀 (예: 미국 금리가 내렸다고? 내 대출 이자는?)",
    "subtitle": "타이틀 아래 들어갈 부제목 (예: 미국 연방준비제도의 깜짝 금리 인하 소식)",
    "speech_bubble": "10~15자 내외의 짧고 웃긴 캐릭터 말말 (예: 대출 탈출 넘버원!)",
    "image_prompt": "FLUX 이미지 생성용 영어 프롬프트"
  },
  "card2": {
    "section_title": "무슨 일이야?",
    "bullets": [
      "기사 팩트 요약 1",
      "기사 팩트 요약 2",
      "기사 팩트 요약 3"
    ],
    "speech_bubble": "팩트에 대한 리액션 캐릭터 말",
    "image_prompt": "FLUX 이미지 생성용 영어 프롬프트"
  },
  "card3": {
    "section_title": "그래서 어떻게 돼?",
    "bullets": [
      "행동/대처 전략 1",
      "행동/대처 전략 2",
      "행동/대처 전략 3"
    ],
    "speech_bubble": "대책에 대한 캐릭터 리액션 말",
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

    // 2. Sanitize emojis & hashtags in Instagram caption
    resultJson.instagram_caption = sanitizeCaption(resultJson.instagram_caption);

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
