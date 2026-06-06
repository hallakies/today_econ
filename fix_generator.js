const fs = require('fs');

let content = fs.readFileSync('src/generator.js', 'utf8');

// 1. Fix maxVisibleLength truncation
content = content.replace(
  /const visibleText = clean\.replace\(\/<\/?hl>\/gi, ''\);\n    if \(visibleText\.length > maxVisibleLength\) {[\s\S]*?clean \+= '<\/hl>';\n      }\n    }/g,
  `const visibleText = clean.replace(/<\\/?hl>/gi, '');
    if (visibleText.length > maxVisibleLength) {
      let visibleCount = 0;
      let inTag = false;
      let cutIndex = clean.length;
      let lastCommaIdx = -1;
      let lastSpaceIdx = -1;

      for (let i = 0; i < clean.length; i++) {
        if (clean[i] === '<' && (clean.substring(i).match(/^<\\/?hl>/i))) {
          inTag = true;
        }
        if (inTag) {
          if (clean[i] === '>') inTag = false;
          continue;
        }
        visibleCount++;
        if (clean[i] === ',' || clean[i] === '\\uff0c') lastCommaIdx = i + 1;
        if (clean[i] === ' ') lastSpaceIdx = i;
        if (visibleCount >= maxVisibleLength) {
          cutIndex = i + 1;
          break;
        }
      }

      const minAcceptable = Math.floor(maxVisibleLength * 0.75);
      let bestCut = cutIndex;

      if (lastCommaIdx > 0) {
        let vc = 0; let it = false;
        for (let j = 0; j < lastCommaIdx; j++) {
          if (clean[j] === '<' && clean.substring(j).match(/^<\\/?hl>/i)) it = true;
          if (it) { if (clean[j] === '>') it = false; continue; }
          vc++;
        }
        if (vc >= minAcceptable) bestCut = lastCommaIdx;
      } else if (lastSpaceIdx > 0) {
        let vc = 0; let it = false;
        for (let j = 0; j < lastSpaceIdx; j++) {
          if (clean[j] === '<' && clean.substring(j).match(/^<\\/?hl>/i)) it = true;
          if (it) { if (clean[j] === '>') it = false; continue; }
          vc++;
        }
        if (vc >= minAcceptable) bestCut = lastSpaceIdx;
      }

      clean = clean.substring(0, bestCut).trim();
      clean = clean.replace(/[\\uc740\\ub294\\uc774\\uac00\\uc744\\ub97c\\uc5d0\\uc11c\\uc758\\ub85c\\uc640\\uacfc\\ub3c4\\ub9cc\\ubd80\\ud130\\uae4c\\uc9c0]$/, '');
      const openCount = (clean.match(/<hl>/gi) || []).length;
      const closeCount = (clean.match(/<\\/hl>/gi) || []).length;
      if (openCount > closeCount) clean += '</hl>';
    }`
);

// 2. Fix prompts
content = content.replace(
  /- \*\*\[CRITICAL\] 페르소나 제약\*\*: 카드 3의 액션은 반드시 \*\*일반 소비자\/직장인\/개인 투자자\*\* 관점에서 작성하세요.*?관련 혜택\(관세 인하 → 수입품 가격 하락\) 활용\n   - \*\*카피라이팅 톤앤매너 \(Actionable CTA\)\*\*: 유저에게 직접 말을 거는 듯한 행동 유도\(CTA\) 문장으로 작성하십시오\.\n     예시: "<hl>반도체 ETF<\/hl> 관심 종목에 추가해보세요!", "<hl>수입 가전 가격<\/hl> 인하 여부 지금 확인하세요!"/gs,
  `- **[CRITICAL] 페르소나 및 관점 제약**: 뉴스 성격에 따라 가장 현실적인 개인 관점의 액션을 유추하십시오. 무조건적으로 주식이나 ETF 투자를 권유하지 마십시오.
     - [부동산/금리 뉴스]: 대출 이자 점검, 예적금 금리 비교, 청약 일정 확인
     - [물가/소비 뉴스]: 대체 소비재 찾기, 지출 예산 재조정, 할인/지원금 제도 활용
     - [정책/행정 뉴스]: 공공데이터 포털 확인, 세금/지원금 정책 대상자 조회, 내 세금이 쓰이는 방향 관심 갖기
     - [산업/기업 뉴스]: 관련 섹터 트렌드 공부, 연관 서비스(플랫폼 등) 활용법 파악
   - **[CRITICAL] 허위/가상의 금융 상품 추천 절대 금지**: "연구ETF", "공공기관ETF" 등 존재하지 않는 가상의 주식이나 펀드, ETF를 지어내서 추천하지 마십시오. 확신할 수 없다면 직접적인 매수 권유 대신 "관련 산업 트렌드 점검" 정도로 순화하십시오.
   - **카피라이팅 톤앤매너 (Actionable CTA)**: 유저에게 직접 말을 거는 듯한 행동 유도(CTA) 문장으로 작성하십시오.
     예시: "<hl>내 예적금 금리</hl> 지금 바로 비교해보세요!", "<hl>정책 지원금 대상자</hl>인지 조회해보세요!"`
);

content = content.replace(
  /"25자 내외 개인 관점 CTA 1 \(반드시 동사형 종결\. 예: <hl>반도체 ETF<\/hl> 관심 종목에 추가해보세요!\)",\n      "25자 내외 개인 관점 CTA 2 \(반드시 동사형 종결\. 예: <hl>수입 가전 가격<\/hl> 인하 여부 확인하세요!\)",\n      "25자 내외 개인 관점 CTA 3 \(반드시 동사형 종결\. 예: <hl>관련 수혜주<\/hl> 실적 비교해보세요!\)"/g,
  `"25자 내외 개인 관점 CTA 1 (반드시 동사형 종결. 예: <hl>예적금 금리</hl> 지금 바로 비교해보세요!)",
      "25자 내외 개인 관점 CTA 2 (반드시 동사형 종결. 예: <hl>정책 지원 대상자</hl>인지 조회해보세요!)",
      "25자 내외 개인 관점 CTA 3 (반드시 동사형 종결. 예: <hl>대체 소비재</hl> 가격 변동 확인해보세요!)"`
);

content = content.replace(
  /"editors_insight": "25~35자 개인 투자\/소비 관점 인사이트 \(강조는 <hl>태그<\/hl> 활용\)",/g,
  `"editors_insight": "25~35자 개인 투자/소비/생활 관점 인사이트 (강조는 <hl>태그</hl> 활용)",`
);

// 3. Update Model calls
content = content.replace(
  /response_format: { type: 'json_object' },\n        temperature: 0.7,\n        max_tokens: 4000,/g,
  `temperature: 0.7,
        max_tokens: 4000,`
);

content = content.replace(
  /model: 'llama-3\.1-8b-instant',[\s\S]*?response_format: { type: 'json_object' },\n        temperature: 0\.7,\n        max_tokens: 2000,/g,
  `model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt.normalize('NFC') },
          { role: 'user', content: userPrompt.normalize('NFC') }
        ],
        temperature: 0.7,
        max_tokens: 3000,`
);

content = content.replace(
  /let resultJson;\n    try {\n      resultJson = JSON\.parse\(resultText\);\n    } catch \(parseError\) {\n      console\.error\('\[Generator\] JSON parse failed\. Attempting repair of truncated JSON\.\.\.'\);\n      \/\/ Try to fix common truncation: missing closing braces\n      let repaired = resultText\.trim\(\);/g,
  `let resultJson;
    
    // Strip markdown code block wrapper if present
    let jsonText = resultText;
    const jsonBlockMatch = jsonText.match(/\`\`\`(?:json)?\\s*\\n?([\\s\\S]*?)\\n?\`\`\`/);
    if (jsonBlockMatch) {
      jsonText = jsonBlockMatch[1].trim();
    }
    // Extract json object explicitly
    if (!jsonText.startsWith('{')) {
      const firstBrace = jsonText.indexOf('{');
      if (firstBrace >= 0) jsonText = jsonText.substring(firstBrace);
    }

    try {
      resultJson = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[Generator] JSON parse failed. Attempting repair of truncated JSON...');
      let repaired = jsonText.trim();`
);

// 4. EMOJI AND HASHTAG UPDATES
content = content.replace(
  /8\. \*\*인스타그램 게시글 멘트 \(instagram_caption\) - 이모지 및 해시태그 중요\*\*:\n   - 줄바꿈과 이모지를 풍부하게 섞어 친근한 해요체로 작성하세요\.\n   - \*\*중요\*\*: 본문에 들어가는 모든 이모지는 반드시 \*\*👀, 📝, 📈, 🚨, ✅ 같은 실제 유니코드 이모지\*\*로 넣으세요\. `:eyes:`, `:memo:`, `:rotating_light:` 같은 Slack 텍스트 코드는 절대로 사용하지 마십시오\.\n   - 본문 내 해시태그를 길게 나열하는 대신 텍스트 본문만 자연스럽게 생성하십시오\. \(해시태그는 스크립트 내부에서 깔끔한 한국어 태그로 후처리 삽입할 것입니다\)\n   - \*\*중요\*\*: `<hl>` 태그는 사용하지 마십시오\. 인스타그램 캡션은 순수 텍스트만 사용합니다\./g,
  `8. **인스타그램 게시글 멘트 (instagram_caption) - [CRITICAL] 이모지 및 특수기호 절대 금지**:
   - 줄바꿈을 활용해 친근한 해요체로 작성하되, 텍스트 복사 시 발생하는 찌꺼기 텍스트를 원천 차단하기 위해 **어떠한 이모지(👀, 📝, 📈 등 포함)나 Slack 텍스트 코드(:eyes: 등)도 절대 사용하지 마십시오**. 오직 순수 텍스트와 줄바꿈표시로만 구성하십시오.
   - 본문 내 해시태그를 길게 나열하는 대신 텍스트 본문만 자연스럽게 생성하십시오. (해시태그는 스크립트 내부에서 깔끔한 한국어 태그로 후처리 삽입할 것입니다)
   - **중요**: \`<hl>\` 태그는 사용하지 마십시오. 인스타그램 캡션은 순수 텍스트만 사용합니다.`
);

content = content.replace(
  /"instagram_caption": "인스타그램 업로드용 긴 글 본문 멘트 \(유니코드 이모지만 사용, <hl> 태그 사용 금지, 해시태그 넣지 말 것\)"/g,
  `"instagram_caption": "인스타그램 업로드용 긴 글 본문 멘트 (<hl> 태그 및 해시태그 금지, **이모지/특수기호 절대 사용 금지** - 텍스트로만 작성)"`
);

fs.writeFileSync('src/generator.js', content, 'utf8');
console.log('Restored generator.js successfully!');
