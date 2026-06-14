const fs = require('fs');
require('dotenv').config();
const { renderCardImages } = require('./src/renderer');

// Mock data representing the new casual tone output
const mockData = {
  template_theme: 'unified',
  theme_color: '#3B82F6',
  card1: {
    title: "월급의 7%가\n이자로 날아간다고요?",
    subtitle: "주담대 금리 7% 돌파, 내 대출은 괜찮을까",
    editors_insight: "<hl>가계부채</hl> 위험 신호가 켜졌어요",
  },
  card2: {
    section_title: "무슨 일이야?",
    bullets: [
      "주택담보대출 <hl>최고 금리가 7%</hl>를 넘어섰어요",
      "고환율과 고물가가 겹치면서 <hl>이자 부담</hl>이 눈덩이처럼 커지고 있거든요",
      "은행들이 <hl>가산금리</hl>를 올리면서 신규 대출자들이 직격탄을 맞고 있어요"
    ],
    hard_terms: [
      { "term": "가산금리", "explanation": "은행이 기준금리 위에 얹는 수수료예요" },
      { "term": "주담대", "explanation": "집을 담보로 빌리는 대출이에요" }
    ],
    editors_insight: "<hl>금리 인하</hl> 기대와 달리 실질 부담은 증가세",
  },
  card3: {
    section_title: "그래서 어떻게 돼?",
    bullets: [
      "<hl>변동금리</hl> 대출자의 월 상환액이 10~20만원 더 늘어날 전망이에요",
      "전세 대출 이자까지 합치면 <hl>월 소득의 30%</hl> 이상이 이자로 빠질 수 있어요",
      "주거래 은행 앱에서 <hl>금리 갈아타기</hl> 시뮬레이션 한번 돌려보세요!"
    ],
    hard_terms: [
      { "term": "변동금리", "explanation": "시장 상황에 따라 이자가 오르내려요" }
    ],
    editors_insight: "<hl>고정금리</hl> 전환 타이밍을 놓치지 마세요",
  },
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
    
    console.log(`\n[Test] --- Test Complete! Check unified_1.png, unified_2.png, unified_3.png ---`);
  } catch (error) {
    console.error('[Test] Failed:', error);
  }
}

runTest();
