const Groq = require('groq-sdk');
const config = require('../config');

// Initialize Groq client
const groq = new Groq({
  apiKey: config.groqApiKey,
});

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
   - 기사에 쓰인 어려운 경제 용어(예: 연준, LTV, GDP, 금리 인하, 인플레이션 등)는 초보자도 쉽게 알 수 있도록 괄호안에 아주 친절한 설명이나 비유를 붙여주세요. 
     (예: "연준(미국의 중앙은행으로 세계 경제의 돈줄을 쥐고 있는 곳)", "LTV(집값 대비 대출한도 - 1억짜리 집이면 최대 얼마까지 대출해줄지 정하는 비율)")
2. **짧고 직관적인 카드 뉴스 텍스트**:
   - 한 장의 카드는 스마트폰 화면에서 3~5초 내에 읽힐 수 있도록 극도로 핵심만 추려야 합니다.
   - 각 불릿 포인트는 한 줄당 25자 내외로 간결하게 끊어 작성해 주세요.
3. **비주얼 컨셉 및 FLUX 이미지 프롬프트**:
   - 각 카드에 어울리는 고해상도 FLUX.1-schnell 이미지 생성 프롬프트를 **영어로** 구체적으로 작성하세요.
   - 프롬프트 지침: "Minimalist modern 3D vector illustration, cute pastel claymation style, isolated on clean solid background, financial theme, no text in image" 스타일을 차용하여 기사 주제에 맞게 변경하세요. 텍스트가 절대 이미지 안에 들어가지 않도록 "no text"를 필수 포함하세요.
4. **캐릭터 말풍선 멘트 (speech_bubble)**:
   - 각 카드 이미지 위에 들어갈 캐릭터 리액션 말풍선 문구를 10~15자 내외의 아주 위트 있고 직관적인 한국어 한마디로 작성하세요.
     (예: "대출 이자 살려줘~", "예금 탈출 신호인가?!", "내 지갑 방어 완료!")
5. **디자인 테마 및 강조 색상 선정 (template_theme & theme_color)**:
   - 뉴스의 주제와 분위기에 맞는 디자인 테마를 선정하세요:
     - "obsidian": 정통 거시경제, 금리, 기업 실적, 증시 시황 뉴스용. (추천 theme_color: "#00d2ff" 또는 네온 블루)
     - "ivory": 친근한 실생활 민생 경제, 정책, 부동산, 일반 소비재 뉴스용. (추천 theme_color: "#705d00" 또는 짙은 골드)
     - "cyber": 미래지향적인 반도체, IT, 빅테크, AI, 코인/암호화폐 뉴스용. (추천 theme_color: "#bc13fe" 또는 네온 퍼플)
6. **인스타그램 게시글 멘트 (instagram_caption)**:
   - 줄바꿈과 이모지를 풍부하게 섞어 친근한 반말 혹은 친절한 해요체로 작성하세요.
   - 멘트 구조:
     - 🚨 호기심을 유발하는 질문/인사
     - 🧐 오늘 경제 뉴스 핵심 내용 요약 (쉬운 말투)
     - 💡 내 지갑을 위한 실천 가이드 또는 교훈
     - 📢 "더 쉽고 유용한 경제 시황을 매일 받아보고 싶다면 팔로우와 좋아요!" 유도 문구
     - 🏷️ 핵심 해시태그 8~10개 (예: #재테크 #경제공부 #경제뉴스 #오늘의경제 #직장인재테크 등)

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
    "section_title": "무슨 일이야? (기사 팩트 요약)",
    "bullets": [
      "최대 3개 이내의 쉬운 우리말 설명 불릿 포인트 (각 불릿은 짧게 작성)",
      "두 번째 핵심 팩트 및 쉬운 해설",
      "세 번째 핵심 팩트 및 쉬운 해설"
    ],
    "speech_bubble": "10~15자 내외 캐릭터 말 (예: 어라? 금리를 깎네?)",
    "image_prompt": "FLUX 이미지 생성용 영어 프롬프트"
  },
  "card3": {
    "section_title": "그래서 어떻게 돼? (나에게 미치는 영향 & 행동 수칙)",
    "bullets": [
      "실생활 영향 및 추천 전략 1 (예: 은행 예금 대신 주식/부동산에 관심이 쏠려요)",
      "추천 전략 2 (예: 당장 무리한 빚은 금물! 금리 추이를 지켜봐야 해요)",
      "추천 전략 3 (예: 매일경제 구독하고 재테크 근육 키우기!)"
    ],
    "speech_bubble": "10~15자 내외 캐릭터 말 (예: 내 지갑 대책 세운다!)",
    "image_prompt": "FLUX 이미지 생성용 영어 프롬프트"
  },
  "instagram_caption": "인스타그램 업로드용 긴 글 멘트 (줄바꿈 및 해시태그 포함)"
}`;

  const userPrompt = `### 선택된 뉴스 기사 정보:
제목: ${selectedNews.title}
링크: ${selectedNews.link}
기사 요약: ${selectedNews.summary}

위의 기사 내용을 분석하여 카드 뉴스 원고와 이미지 프롬프트, 인스타그램 멘트를 생성해 주세요.`;

  try {
    console.log('[Generator] Requesting content generation from Groq Llama 3.3 70B...');
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

      const resultText = response.choices[0].message.content.trim();
      console.log('[Generator] Successfully generated card content.');
      return JSON.parse(resultText);
    } catch (apiError) {
      // Fallback for 429 Rate Limits on Free Tier
      if (apiError.status === 429 || (apiError.message && apiError.message.includes('rate_limit'))) {
        console.warn('[Generator] 429 Rate limit hit on 70B model. Falling back to Llama 3.1 8B...');
        const response = await groq.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        });

        const resultText = response.choices[0].message.content.trim();
        console.log('[Generator] Successfully generated card content via 8B model fallback.');
        return JSON.parse(resultText);
      } else {
        throw apiError;
      }
    }
  } catch (error) {
    console.error('[Generator] Failed to generate card content:', error);
    throw error;
  }
}

module.exports = {
  generateCardContent,
};
