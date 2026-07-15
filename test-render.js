const fs = require('fs');
require('dotenv').config();
const { renderCardImages } = require('./src/renderer');

// Mock data representing the new casual tone output
const mockData = {
  template_theme: 'unified',
  theme_color: '#3B82F6',
  card1: {
    title: "대출 한도가\n내 집을 먼저 결정해요",
    subtitle: "실수요자라면 집값보다 먼저 볼 숫자",
  },
  card2: {
    section_title: "숫자로 보는 핵심",
    bullets: [
      "은행권은 <hl>주택담보대출 한도</hl>를 줄이는 방안을 검토하고 있어요.",
      "무주택 실수요자의 <hl>자금 조달 부담</hl>이 이전보다 커질 수 있어요."
    ],
    hard_terms: [
      { "term": "대출 총량제", "explanation": "은행별로 내줄 수 있는 대출 총량을 정해두는 방식이에요" }
    ],
  },
  card3: {
    section_title: "내 돈에는 이렇게",
    bullets: [
      "대출을 준비 중이라면 <hl>내 한도와 월 상환액</hl>을 다시 계산해야 해요.",
      "현금 비중이 높다면 <hl>매수 시점보다 조건</hl>을 먼저 비교하는 편이 나아요."
    ],
    hard_terms: [],
  },
  card4: {
    section_title: "오늘 확인할 것",
    bullets: [
      "실수요자 보완책이 나오는지가 <hl>대출 수요의 변수</hl>가 될 전망이에요.",
      "은행별 운영 기준에 따라 <hl>현장 한도 차이</hl>는 남을 수 있어요.",
      "은행 앱에서 <hl>내 대출 조건</hl>과 월 상환액을 직접 비교해보세요."
    ],
    hard_terms: [],
  },
  core_insight: "집값만 보면 놓치기 쉬운 것은 <hl>내가 빌릴 수 있는 돈</hl>이에요.",
  news_date: "2026.6.14",
  instagram_caption: "오늘 뉴스 보다가 깜짝 놀랐는데요~ 주담대 금리가 7%를 넘었대요..."
};

async function runTest() {
  console.log('[Test] --- Starting Unified Theme Render Test ---');
  
  const startTime = Date.now();
  try {
    // Test with a real news og:image URL (from MK economy)
    const testOgImage = 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1080&h=1920&fit=crop&q=80';
    
    const files = await renderCardImages(mockData, testOgImage);
    
    console.log(`[Test] Success! Generated ${files.length} slides in ${((Date.now() - startTime) / 1000).toFixed(2)}s:`);
    files.forEach(f => console.log(` - ${f}`));
    
    // Rename to preserve them
    for (let j = 0; j < files.length; j++) {
      const oldPath = files[j];
      const newPath = `unified_${j + 1}.png`;
      if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
        console.log(`[Test] Renamed: ${oldPath} -> ${newPath}`);
      }
    }
    
    console.log(`\n[Test] --- Test Complete! Check unified_1.png through unified_4.png ---`);
  } catch (error) {
    console.error('[Test] Failed:', error);
  }
}

runTest();
