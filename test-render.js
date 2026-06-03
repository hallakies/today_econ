const fs = require('fs');
const { renderCardImages } = require('./src/renderer');

// Mock data representing a typical Llama-generated response
const mockData = {
  card1: {
    title: "미국 금리가 내렸다고?\n내 대출 이자는 어떻게 될까?",
    subtitle: "미국 연방준비제도(연준)의 깜짝 0.5%p 금리 인하 소식",
    speech_bubble: "대출 탈출 넘버원! 💸",
    image_prompt: "Minimalist modern 3D vector illustration, cute pastel claymation style, a piggy bank with percentage symbol, isolated on clean solid background, financial theme, no text"
  },
  card2: {
    section_title: "무슨 일이야?",
    bullets: [
      "미국 연준(미국의 중앙은행)이 기준금리를 0.5%p 낮추는 '빅컷'을 단행했어요.",
      "인플레이션(물가가 지속적으로 오르는 현상)이 잡히기 시작하면서 경기 침체를 막기 위한 선제 조치예요.",
      "금리 인하는 시중에 더 많은 돈을 풀어서 경기를 활성화하겠다는 뜻이에요."
    ],
    speech_bubble: "어라? 금리를 깎네? ✂️",
    image_prompt: "Minimalist modern 3D vector illustration, cute pastel claymation style, a clock with gears and dollar bills, isolated on clean solid background, financial theme, no text"
  },
  card3: {
    section_title: "그래서 어떻게 돼?",
    bullets: [
      "대출 이자 부담이 줄어들 가능성이 커요. 변동 금리 대출을 가진 분들은 대출 갈아타기를 고민해 보세요.",
      "예금/적금 이자는 낮아지기 때문에, 주식이나 부동산 등 자산 시장으로 돈이 이동할 수 있어요.",
      "매일경제 경제 뉴스를 매일 읽으며 지갑을 지킬 스마트한 전략을 세워야 합니다!"
    ],
    speech_bubble: "내 지갑 절대 지켜! 🛡️",
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
