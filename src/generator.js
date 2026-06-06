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
      clean = clean.replace(/[\uc740\ub294\uc774\uac00\uc744\ub97c\uc5d0\uc11c\uc758\ub85c\uc640\uacfc\ub3c4\ub9cc\ubd80\ud130\uae4c\uc9c0]$/, '');
      const openCount = (clean.match(/<hl>/gi) || []).length;
      const closeCount = (clean.match(/<\/hl>/gi) || []).length;
      if (openCount > closeCount) clean += '</hl>';
    }
    return clean;
  }

  // Card 2
  if (result.card2 && Array.isArray(result.card2.bullets)) {
    result.card2.bullets = result.card2.bullets.map(b => cleanText(b, 90, false)); // Increased to 90
  }
  if (result.card2 && result.card2.editors_insight) {
    result.card2.editors_insight = cleanText(result.card2.editors_insight, 90, false);
  }

  // Card 3
  if (result.card3 && Array.isArray(result.card3.bullets)) {
    result.card3.bullets = result.card3.bullets.map(b => cleanText(b, 90, true)); // Increased to 90
  }
  if (result.card3 && result.card3.editors_insight) {
    result.card3.editors_insight = cleanText(result.card3.editors_insight, 90, true);
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
3. **가독성 및 깊이 있는 정보 전달 (필수)**:
   - 릴스 화면에서 시청자가 읽기 좋으면서도, 단순 겉핥기가 아닌 깊이 있는 정보를 제공하십시오.
   - 각 불릿 포인트는 **구체적인 데이터와 맥락이 포함된 완전한 문장(한국어 30~45자 내외)**으로 작성해야 합니다. 너무 짧고 건조한 단어 나열은 절대 금지합니다.
   - **[CRITICAL] 명사형 종결이나 단어 나열식 요약은 절대 금지**합니다. 반드시 "~다", "~전망입니다", "~예상됩니다" 등 **서술어가 포함된 완전한 문장**으로 끝맺으세요.
4. **카드 2와 카드 3의 완전 분리 및 실질적 Action 강제 (필수)**:
   - **카드 2(card2)**: 기사 내용의 핵심 팩트(Fact) 요약 3가지입니다. (배지명 추천: "무슨 일이야?")
   - **카드 3(card3)**: **20~30대 직장인, 재테크 초보자**가 이 뉴스를 보고 "앞으로 어떻게 될까? 나는 뭘 준비해야 하지?"에 대한 답을 얻을 수 있도록 다음 **3가지 스텝(예측 -> 영향 -> 행동)**으로 구성하십시오. (배지명 추천: "그래서 어떻게 돼?")
     - [불릿 1 - 예측]: 해당 뉴스가 불러올 단기적 시장/산업 트렌드 변화 (예: "반도체 장비 수요 급증 전망")
     - [불릿 2 - 영향]: 이 이슈가 내 지갑/자산/소비에 미치는 파급력 (예: "가전제품 가격 인하로 가계 지출 절감 가능성")
     - [불릿 3 - 행동]: 지금 당장 취해야 할 구체적 행동 지침 (예: "환율 변동 대비 현금 흐름 점검하세요!")
   - **[CRITICAL] 페르소나 오류(내부 직원 빙의) 절대 금지**: 독자는 해당 뉴스에 등장하는 기업의 임직원이 아닙니다. 절대 "부서 협업 설계하세요", "보고 라인 점검하세요"와 같이 내부 직원을 향한 엉뚱한 업무 지시를 내리지 마십시오. 철저히 외부 투자자 및 일반 소비자의 관점을 유지하십시오.
   - **[CRITICAL] 허위/가상의 금융 상품 추천 절대 금지**: "연구ETF", "공공기관ETF" 등 존재하지 않는 가상의 주식이나 펀드, ETF를 지어내서 추천하지 마십시오. 확신할 수 없다면 직접적인 매수 권유 대신 "관련 산업 트렌드 점검" 정도로 순화하십시오.
5. **에디토리얼 인사이트(editors_insight) 작성**:
   - 가벼워 보이는 말풍선이나 이모티콘 독백 대신, 뉴스 레터 스타일의 **격식 있고 신뢰감 주는 한 줄 요약 평(인사이트)**을 20자 내외의 정중한 어조로 작성하세요. (이모지 남발 금지, 최대 1개)
   - **[CRITICAL] 뻔한 행동 지시 금지**: "투자 전략을 재조정하세요", "포트폴리오를 점검하세요" 같은 하나마나 한 양산형 조언을 절대 적지 마십시오. 대신 **"이 뉴스가 향후 금리 인하, 물가 상승, 환율 변동 중 어디에 파급력을 미칠지 거시경제적 예측을 담은 냉철한 1문장"**으로 구체화하십시오.
   - **중요**: 해당 카드의 제목이나 불릿 포인트에 사용된 텍스트를 그대로 반복하지 마십시오. 단어를 그대로 재활용하여 대충 만든 인상을 주는 행위를 엄격히 금지합니다.
6. **비주얼 컨셉 및 FLUX 이미지 프롬프트 (로컬라이즈 및 일관성 필수)**:
   - 각 카드에 어울리는 고해상도 FLUX.1-schnell 이미지 생성 프롬프트를 **반드시 순수한 영어로만 (NO KOREAN)** 구체적으로 작성하세요.
   - **필수 스타일 제약**: 모든 카드 이미지가 동일한 비주얼 톤앤매너를 유지해야 합니다. 다음 스타일 키워드를 프롬프트에 메인으로 고정 포함하십시오: "Consistent minimalist 3D vector illustration style, cute pastel claymation, isolated on clean solid background, financial theme, no text in image".
   - **글자 생성 절대 금지**: 이미지 내부에 'REVENUE', 'BUSINESS', 'MONEY', 숫자 등 어떠한 문자도 렌더링되지 않도록 프롬프트에서 **지폐(banknotes), 문서(documents), 모니터(screens), 차트 레이블** 등의 묘사를 원천 금지하십시오. 텍스트가 적힐 수 없는 완전히 추상적인 구형, 큐브 형태의 도형이나 보석으로 대체하십시오.
   - **로컬라이제이션(한국화) 포기 및 메타포 사용 필수**: 서양 AI 모델은 한국 화폐를 그릴 줄 모릅니다. "한국 원화 지폐"를 지시하면 달러를 그리므로 지폐 묘사 자체를 금지하십시오. 대신 경제/재물을 상징할 때는 **"황금 돼지저금통(gold piggy bank), 황금 동전 무더기(pile of gold coins), 상승하는 추상적 3D 황금 화살표(abstract 3D gold arrow), 빛나는 보석"** 등의 보편적인 메타포를 프롬프트에 강제하십시오.
   - **비주얼 통일성 및 1차원 매칭 회피**: 실사 사진 분위기는 철저히 배제하십시오. 뉴스 팩트를 너무 1차원적으로 묘사하여 재미없게 그리지 말고, 3D 클레이 장난감 피규어나 매끄러운 세라믹 질감의 도형으로 비유하십시오.
   - **도메인 맞춤 라우팅 및 톤앤매너 강제 (CRITICAL)**: 뉴스 주제가 '산업', '에너지', '금융', '중공업', '건설' 등에 해당한다면, 뷰티 채널에 어울릴 법한 "추상적인 마블링, 스모크 그래픽, 화려한 형형색색의 질감"은 절대 프롬프트에 묘사되지 않도록 강하게 네거티브 제약(negative constraints)을 거십시오. 대신 "묵직하고 쨍한 명암비(High-contrast)를 살린 인더스트리얼(Industrial Noir) 풍"이나 "신뢰감을 주는 다크 코퍼레이트(Dark Corporate) 테마"를 이미지 프롬프트에 강제 주입하십시오.
7. **디자인 테마 및 강조 색상 선정 (template_theme & theme_color)**:
   - 뉴스의 주제와 분위기에 맞는 디자인 테마를 선정하세요:
     - "obsidian": 정통 거시경제, 금리, 기업 실적, 증시 시황 뉴스용. (추천 theme_color: "#00d2ff" 또는 네온 블루)
     - "ivory": 친근한 실생활 민생 경제, 정책, 부동산, 일반 소비재 뉴스용. (추천 theme_color: "#705d00" 또는 짙은 골드)
     - "cyber": 미래지향적인 반도체, IT, 빅테크, AI, 코인/암호화폐 뉴스용. (추천 theme_color: "#bc13fe" 또는 네온 퍼플)
8. **인스타그램 게시글 멘트 (instagram_caption) - 슬랙 복붙 버그 우회**:
   - 줄바꿈과 기호를 풍부하게 섞어 친근한 해요체로 작성하세요.
   - **[CRITICAL] 이모지(Emoji) 및 슬랙 숏코드 절대 금지**: 슬랙 앱에서 텍스트를 복사할 때 이모지가 깨지거나 숏코드로 변환되는 버그가 있습니다. 이를 원천 차단하기 위해 **모든 종류의 그림 이모지(👀, 📝, 📈 등) 및 슬랙 숏코드(:eyes: 등) 사용을 100% 금지**합니다.
   - 강조가 필요할 때는 오직 슬랙이 건드릴 수 없는 **기본 텍스트 특수 기호(■, ▶, ✔, 📌, 💡 등)**만을 사용하십시오.
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
      "45자 내외 구체적인 팩트와 맥락 설명 1 (단순 나열 불가, 완전한 문장으로 상세히. 예: 인터넷은행들이 가계대출 규제를 피해 <hl>개인사업자 대출</hl>을 49%나 늘렸습니다.)",
      "45자 내외 구체적인 팩트와 맥락 설명 2 (강조 단어는 반드시 <hl>태그</hl> 활용 및 문장형 종결)",
      "45자 내외 구체적인 팩트와 맥락 설명 3 (강조 단어는 반드시 <hl>태그</hl> 활용 및 문장형 종결)"
    ],
    "editors_insight": "팩트에 대한 한 줄 에디터 평 (강조 단어는 반드시 <hl>태그</hl> 활용)",
    "image_prompt": "FLUX 이미지 생성용 영어 프롬프트"
  },
  "card3": {
    "section_title": "그래서 어떻게 돼?",
    "bullets": [
      "45자 내외 [예측]: 뉴스가 불러올 단기적 트렌드/시장 변화 (예: 외상매출채권 <hl>상환청구권 폐지</hl>로 중소기업 연쇄 부도 위험이 감소할 전망입니다.)",
      "45자 내외 [영향]: 내 지갑/자산/업무에 미치는 실질적 파급력 (예: 원청기업의 파산 리스크를 떠안지 않아 중소기업의 <hl>현금 흐름</hl>이 크게 개선됩니다.)",
      "45자 내외 [행동]: 지금 당장 취할 구체적 행동 지침 (피상적 조언 불가, 반드시 구체적인 동사 종결. 예: 주거래 은행을 통해 <hl>대출 상환 조건</hl>이 어떻게 바뀌는지 즉시 확인해보세요!)"
    ],
    "editors_insight": "대책에 대한 행동 유도 에디터 평 (강조 단어는 반드시 <hl>태그</hl> 활용. 예: <hl>리스크 관리</hl>를 지금 시작해야 합니다)",
    "image_prompt": "FLUX 이미지 생성용 영어 프롬프트"
  },
  "instagram_caption": "인스타그램 업로드용 긴 글 본문 멘트 (<hl> 태그 금지, **유니코드 이모지는 자유롭게 사용하되, 슬랙용 숏코드(:eyes: 등)는 절대 사용 금지** - 일반 텍스트와 이모지로 작성)"
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
        temperature: 0.7,
        max_tokens: 8000,
      });
      resultText = (response.choices[0]?.message?.content || '').trim();
      console.log('[Generator] Main model raw response length:', resultText.length);
      if (!resultText) throw new Error("Main model returned empty content");
    } catch (apiError) {
      console.warn('[Generator] Main model failed. Error:', apiError.message || apiError);
      console.warn('[Generator] Falling back to Llama 3.3 70B...');
      const response = await callGroqWithRetry({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt.normalize('NFC') },
          { role: 'user', content: userPrompt.normalize('NFC') }
        ],
        temperature: 0.7,
        max_tokens: 8000,
      }, 3, 3000);
      resultText = (response.choices[0]?.message?.content || '').trim();
      console.log('[Generator] Fallback model raw response length:', resultText.length);
      if (!resultText) throw new Error("Fallback model returned empty content");
    }

    console.log('[Generator] Raw content generated from LLM. Validating & Sanitizing...');
    console.log('[Generator] Raw LLM Text snippet (first 300 chars):', resultText.substring(0, 300));
    
    // Strip markdown code block wrapper if present
    let jsonText = resultText;
    const jsonBlockMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonBlockMatch) {
      jsonText = jsonBlockMatch[1].trim();
    }
    // Extract json object explicitly
    if (!jsonText.startsWith('{')) {
      const firstBrace = jsonText.indexOf('{');
      if (firstBrace >= 0) jsonText = jsonText.substring(firstBrace);
    }

    let resultJson;
    try {
      resultJson = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[Generator] JSON parse failed. Attempting repair of truncated JSON...');
      console.error('[Generator] Raw jsonText snippet:', jsonText.substring(Math.max(0, jsonText.length - 200)));
      let repaired = jsonText.trim();
      const openBraces = (repaired.match(/\{/g) || []).length;
      const closeBraces = (repaired.match(/\}/g) || []).length;
      if (openBraces > closeBraces) {
        repaired += '}'.repeat(openBraces - closeBraces);
      }
      try {
        resultJson = JSON.parse(repaired);
      } catch (repairError) {
        console.error('[Generator] Repair failed. Repaired text snippet:', repaired.substring(Math.max(0, repaired.length - 200)));
        throw new Error('Failed to parse and repair JSON from model output');
      }
    }
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
