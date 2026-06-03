const fs = require('fs');
const { renderCardImages } = require('./src/renderer');

// Mock data representing a typical Llama-generated response
const mockData = {
  card1: {
    title: "미국 금리가 내렸다고?\n내 대출 이자는 어떻게 될까?",
    subtitle: "미국 연방준비제도(연준)의 깜짝 0.5%p 금리 인하 소식",
    editors_insight: "미국 금리 인하 전격 단행",
    image_prompt: "Minimalist modern 3D vector illustration, cute pastel claymation style, a piggy bank with percentage symbol, isolated on clean solid background, financial theme, no text"
  },
  card2: {
    section_title: "무슨 일이야?",
    bullets: [
      "미국 기준금리 0.5%p 인하",
      "인플레이션 안정화 신호",
      "경기 침체 선제적 예방"
    ],
    editors_insight: "빅컷 단행으로 금리 하락 국면 진입",
    image_prompt: "Minimalist modern 3D vector illustration, cute pastel claymation style, a clock with gears and dollar bills, isolated on clean solid background, financial theme, no text"
  },
  card3: {
    section_title: "그래서 어떻게 돼?",
    bullets: [
      "변동금리 대출 갈아타기",
      "고금리 예적금 막차 가입",
      "자산 포트폴리오 다각화"
    ],
    editors_insight: "대출 금리 변동 추이를 주시해야 합니다.",
    image_prompt: "Minimalist modern 3D vector illustration, cute pastel claymation style, a plant growing out of a coin stack, isolated on clean solid background, financial theme, no text"
  },
  instagram_caption: "오늘의 경제 1분 요약!..."
};

async function runTest() {
  const themes = ['obsidian', 'ivory', 'cyber'];
  const colors = ['#00d2ff', '#705d00', '#bc13fe'];
  
  console.log('[Test] --- Starting Local Visual Render Test for 3 Stitch Themes ---');
  console.log('[Test] This will generate 3 cards for each of the 3 themes (9 images in total).');
  
  const totalStartTime = Date.now();
  
  for (let i = 0; i < themes.length; i++) {
    const theme = themes[i];
    const color = colors[i];
    console.log(`\n[Test] [Theme ${i + 1}/${themes.length}] Rendering: ${theme.toUpperCase()} (${color})...`);
    
    const testData = {
      ...mockData,
      template_theme: theme,
      theme_color: color
    };
    
    const themeStartTime = Date.now();
    try {
      const files = await renderCardImages(testData);
      
      // Rename outputs to preserve them separately
      const renamedFiles = [];
      for (let j = 0; j < files.length; j++) {
        const oldPath = files[j];
        const newPath = `${theme}_${j + 1}.png`;
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
          renamedFiles.push(newPath);
        }
      }
      
      console.log(`[Test] Success! Generated ${theme} theme in ${((Date.now() - themeStartTime) / 1000).toFixed(2)}s:`);
      renamedFiles.forEach(f => console.log(` - ${f}`));
    } catch (error) {
      console.error(`[Test] Failed to render theme ${theme}:`, error);
    }
  }
  
  console.log(`\n[Test] --- Visual Render Test Completed! Total time: ${((Date.now() - totalStartTime) / 1000).toFixed(2)}s ---`);
  console.log('[Test] You can now view all 9 PNG files in your workspace.');
}

runTest();
