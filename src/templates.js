/**
 * Google Stitch designed HTML/CSS templates for today.econ card news.
 * Optimized for mobile (Instagram Reels / 9:16 Slides) with full-bleed visual layouts and premium typography.
 */

/**
 * Obsidian Theme (Dark Mode Premium Glassmorphism)
 */
function renderObsidian(cardType, content, imageBase64, themeColor) {
  let innerHtml = '';
  
  if (cardType === 'title') {
    innerHtml = `
      <div class="slide-container relative w-[1080px] h-[1920px] overflow-hidden flex flex-col justify-between p-16 select-none">
        <img class="absolute inset-0 w-full h-full object-cover z-0" src="data:image/png;base64,${imageBase64}" alt="illustration" />
        <div class="absolute inset-0 bg-gradient-to-b from-[#050811]/30 via-[#050811]/70 to-[#050811] z-10"></div>
        <div class="ambient-glow glow-primary w-[700px] h-[700px] bottom-[-200px] right-[-200px] z-10"></div>
        
        <header class="w-full pt-16 flex justify-between items-center z-20">
          <span class="material-symbols-outlined text-primary text-5xl">trending_up</span>
          <div class="font-display font-extrabold text-primary text-4xl tracking-tight">today.econ 📈</div>
          <span class="material-symbols-outlined text-primary text-5xl">more_horiz</span>
        </header>

        <main class="flex-1 flex flex-col z-20 justify-end pb-12">
          <div class="glass-card rounded-3xl p-10 space-y-6 text-center shadow-[0_25px_60px_rgba(0,0,0,0.65)]">
            <span class="inline-block px-6 py-2 rounded-full bg-primary/20 border border-primary/40 text-primary font-label-caps text-xl tracking-widest backdrop-blur-md">TODAY</span>
            <h1 class="font-display text-5xl font-extrabold text-white leading-tight break-keep px-2">${content.title.replace(/\n/g, '<br/>')}</h1>
            <p class="font-body text-2.5xl text-slate-300 mt-4 px-6 break-keep leading-relaxed font-semibold">${content.subtitle}</p>
            ${content.editors_insight ? `
              <div class="mt-6 pt-6 border-t border-white/10 flex items-center justify-center gap-4 text-primary font-bold text-2.5xl bg-primary/5 rounded-2xl py-4 px-5">
                <span class="text-3xl">💡</span>
                <p class="text-left text-slate-200 leading-normal font-bold text-2xl">${content.editors_insight}</p>
              </div>
            ` : ''}
          </div>
          <div class="footer-area text-slate-500 font-bold text-center text-2xl mt-12">📍 @today.econ</div>
        </main>
      </div>
    `;
  } else {
    const isFact = cardType === 'fact';
    const badgeText = isFact ? content.section_title || '무슨 일이야?' : content.section_title || '그래서 어떻게 돼?';
    const badgeBg = isFact ? `${themeColor}20` : '#10b98120';
    const badgeColor = isFact ? themeColor : '#10b981';
    const badgeBorder = isFact ? `${themeColor}40` : '#10b98140';

    const bulletsHtml = content.bullets
      .map(bullet => `
        <li class="flex items-center gap-6 py-4">
          <div class="w-10 h-10 rounded-full bg-slate-900/80 flex items-center justify-center border ${isFact ? 'border-primary/40' : 'border-[#10b981]/40'} shrink-0 shadow-[0_0_12px_${isFact ? themeColor : '#10b981'}30]">
            ${isFact ? `
              <span class="w-3.5 h-3.5 rounded-full bg-primary"></span>
            ` : `
              <svg class="w-5 h-5 text-[#10b981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            `}
          </div>
          <p class="font-body text-3.5xl text-slate-100 font-extrabold leading-normal break-keep">${bullet}</p>
        </li>
      `).join('<div class="w-full h-px bg-white/5 my-1"></div>');

    innerHtml = `
      <div class="slide-container relative w-[1080px] h-[1920px] overflow-hidden flex flex-col justify-between p-16 select-none">
        <img class="absolute inset-0 w-full h-full object-cover z-0" src="data:image/png;base64,${imageBase64}" alt="illustration" />
        <div class="absolute inset-0 bg-gradient-to-b from-[#050811]/30 via-[#050811]/70 to-[#050811] z-10"></div>
        <div class="ambient-glow glow-primary w-[700px] h-[700px] bottom-[-200px] right-[-200px] z-10"></div>
        
        <header class="w-full pt-16 flex justify-between items-center z-20">
          <span class="material-symbols-outlined text-primary text-5xl">trending_up</span>
          <div class="font-display font-extrabold text-primary text-4xl tracking-tight">today.econ 📈</div>
          <span class="material-symbols-outlined text-primary text-5xl">more_horiz</span>
        </header>

        <main class="flex-1 flex flex-col z-20 justify-end pb-12">
          <div class="glass-card rounded-3xl p-10 space-y-6 shadow-[0_25px_60px_rgba(0,0,0,0.65)]">
            <div class="mb-4">
              <span class="inline-block px-6 py-2 rounded-full font-label-caps text-xl tracking-wider" style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder};">${badgeText}</span>
            </div>
            
            <ul class="space-y-4">
              ${bulletsHtml}
            </ul>

            ${content.editors_insight ? `
              <div class="mt-6 pt-6 border-t border-white/10 flex items-start gap-4 text-primary font-bold text-2.5xl bg-primary/5 rounded-2xl py-4 px-5">
                <span class="text-3xl">💡</span>
                <p class="text-left text-slate-200 leading-normal font-bold text-2xl">${content.editors_insight}</p>
              </div>
            ` : ''}
          </div>
          
          <div class="w-full flex flex-col items-center space-y-6 mt-8">
            ${!isFact ? `
              <div class="cta-banner w-full text-center text-slate-300 font-bold text-2xl py-4" style="border-top: 1.5px dashed rgba(255,255,255,0.15)">
                📢 유용한 시황을 매일 보시려면 <span style="color: ${themeColor}">[팔로우]</span> 해주세요!
              </div>
            ` : ''}
            <div class="footer-area text-slate-500 font-bold text-center text-2xl">📍 @today.econ</div>
          </div>
        </main>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html class="dark" lang="ko">
    <head>
      <meta charset="utf-8"/>
      <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
      <title>today.econ Obsidian Card</title>
      <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
      <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.css" />
      <script>
        tailwind.config = {
          darkMode: "class",
          theme: {
            extend: {
              colors: {
                primary: "${themeColor}",
                "primary-container": "${themeColor}",
                background: "#0A0E1A"
              },
              fontSize: {
                '2.5xl': '1.75rem',
                '3.5xl': '2.1rem',
              },
              fontFamily: {
                display: ["Pretendard", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
                body: ["Pretendard", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"]
              }
            }
          }
        }
      </script>
      <style>
        body { background-color: #050811; overflow: hidden; }
        .glass-card {
          background-color: rgba(10, 14, 26, 0.85);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .ambient-glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          z-index: 5;
          pointer-events: none;
        }
        .glow-primary {
          background: radial-gradient(circle, ${themeColor}15 0%, transparent 70%);
        }
        .slide-container {
          background-color: #050811;
        }
      </style>
    </head>
    <body class="text-white antialiased flex items-center justify-center min-h-screen">
      ${innerHtml}
    </body>
    </html>
  `;
}

/**
 * Ivory Theme (Light Mode Premium Editorial)
 */
function renderIvory(cardType, content, imageBase64, themeColor) {
  let innerHtml = '';
  
  if (cardType === 'title') {
    innerHtml = `
      <div class="slide-container relative w-[1080px] h-[1920px] overflow-hidden flex flex-col justify-between p-16 select-none">
        <img class="absolute inset-0 w-full h-full object-cover z-0" src="data:image/png;base64,${imageBase64}" alt="illustration" />
        <div class="absolute inset-0 bg-gradient-to-b from-[#FDFBF7]/30 via-[#FDFBF7]/70 to-[#FDFBF7] z-10"></div>
        
        <header class="w-full pt-16 flex justify-between items-center z-20">
          <span class="material-symbols-outlined text-slate-800 text-5xl">trending_up</span>
          <div class="font-display font-extrabold text-slate-800 text-4xl tracking-tight">today.econ 📈</div>
          <span class="material-symbols-outlined text-slate-800 text-5xl">more_horiz</span>
        </header>

        <main class="flex-1 flex flex-col z-20 justify-end pb-12">
          <div class="glass-card rounded-3xl p-10 space-y-6 text-center shadow-[0_20px_45px_rgba(0,0,0,0.06)]">
            <span class="inline-block px-6 py-2 rounded bg-slate-800 text-white font-label-caps text-xl tracking-widest">TODAY</span>
            <h1 class="font-display text-5xl font-extrabold text-slate-800 leading-tight break-keep px-2">${content.title.replace(/\n/g, '<br/>')}</h1>
            <p class="font-body text-2.5xl text-slate-600 mt-4 px-6 break-keep leading-relaxed font-bold">${content.subtitle}</p>
            ${content.editors_insight ? `
              <div class="mt-6 pt-6 border-t border-slate-200/80 flex items-center justify-center gap-4 text-secondary font-bold text-2.5xl bg-secondary/5 rounded-2xl py-4 px-5">
                <span class="text-3xl">💡</span>
                <p class="text-left text-slate-700 leading-normal font-bold text-2xl">${content.editors_insight}</p>
              </div>
            ` : ''}
          </div>
          <div class="footer-area text-slate-500 font-bold text-center text-2xl mt-12">📍 @today.econ</div>
        </main>
      </div>
    `;
  } else {
    const isFact = cardType === 'fact';
    const badgeText = isFact ? content.section_title || '무슨 일이야?' : content.section_title || '그래서 어떻게 돼?';
    
    // Ivory Theme palette (Fact: deep gold, Action: warm terracotta/orange)
    const badgeColor = isFact ? '#705d00' : '#c2410c';
    const badgeBg = isFact ? 'rgba(112, 93, 0, 0.08)' : 'rgba(194, 65, 12, 0.08)';
    const badgeBorder = isFact ? 'rgba(112, 93, 0, 0.2)' : 'rgba(194, 65, 12, 0.2)';

    const bulletsHtml = content.bullets
      .map(bullet => `
        <li class="flex items-center gap-6 py-4">
          <div class="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center border ${isFact ? 'border-[#705d00]/30' : 'border-[#c2410c]/30'} shrink-0 shadow-[0_0_12px_${isFact ? 'rgba(112,93,0,0.15)' : 'rgba(194,65,12,0.15)'}]">
            ${isFact ? `
              <span class="w-3.5 h-3.5 rounded-full" style="background-color: ${badgeColor}"></span>
            ` : `
              <svg class="w-5 h-5" style="color: ${badgeColor}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            `}
          </div>
          <p class="font-body text-3.5xl text-slate-800 font-extrabold leading-normal break-keep">${bullet}</p>
        </li>
      `).join('<div class="w-full h-px bg-slate-200/60 my-1"></div>');

    innerHtml = `
      <div class="slide-container relative w-[1080px] h-[1920px] overflow-hidden flex flex-col justify-between p-16 select-none">
        <img class="absolute inset-0 w-full h-full object-cover z-0" src="data:image/png;base64,${imageBase64}" alt="illustration" />
        <div class="absolute inset-0 bg-gradient-to-b from-[#FDFBF7]/30 via-[#FDFBF7]/70 to-[#FDFBF7] z-10"></div>
        
        <header class="w-full pt-16 flex justify-between items-center z-20">
          <span class="material-symbols-outlined text-slate-800 text-5xl">trending_up</span>
          <div class="font-display font-extrabold text-slate-800 text-4xl tracking-tight">today.econ 📈</div>
          <span class="material-symbols-outlined text-slate-800 text-5xl">more_horiz</span>
        </header>

        <main class="flex-1 flex flex-col z-20 justify-end pb-12">
          <div class="glass-card rounded-3xl p-10 space-y-6 shadow-[0_20px_45px_rgba(0,0,0,0.06)]">
            <div class="mb-4">
              <span class="inline-block px-6 py-2 rounded font-label-caps text-xl tracking-wider" style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder};">${badgeText}</span>
            </div>
            
            <ul class="space-y-4">
              ${bulletsHtml}
            </ul>

            ${content.editors_insight ? `
              <div class="mt-6 pt-6 border-t border-slate-200/80 flex items-start gap-4 text-secondary font-bold text-2.5xl bg-secondary/5 rounded-2xl py-4 px-5">
                <span class="text-3xl">💡</span>
                <p class="text-left text-slate-700 leading-normal font-bold text-2xl">${content.editors_insight}</p>
              </div>
            ` : ''}
          </div>
          
          <div class="w-full flex flex-col items-center space-y-6 mt-8">
            ${!isFact ? `
              <div class="cta-banner w-full text-center text-slate-600 font-bold text-2xl py-4" style="border-top: 1.5px dashed rgba(0,0,0,0.15)">
                📢 유용한 시황을 매일 보시려면 <span style="color: ${themeColor}">[팔로우]</span> 해주세요!
              </div>
            ` : ''}
            <div class="footer-area text-slate-500 font-bold text-center text-2xl">📍 @today.econ</div>
          </div>
        </main>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="utf-8"/>
      <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
      <title>today.econ Ivory Card</title>
      <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
      <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.css" />
      <script>
        tailwind.config = {
          theme: {
            extend: {
              colors: {
                primary: "#121212",
                secondary: "#705d00"
              },
              fontSize: {
                '2.5xl': '1.75rem',
                '3.5xl': '2.1rem',
              },
              fontFamily: {
                display: ["Pretendard", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
                body: ["Pretendard", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"]
              }
            }
          }
        }
      </script>
      <style>
        body {
          background-color: #FDFBF7;
          overflow: hidden;
        }
        .glass-card {
          background: rgba(253, 251, 247, 0.9);
          backdrop-filter: blur(30px);
          border: 1px solid rgba(255, 255, 255, 0.95);
        }
      </style>
    </head>
    <body class="text-slate-800 antialiased flex items-center justify-center min-h-screen">
      ${innerHtml}
    </body>
    </html>
  `;
}

/**
 * Cyber Theme (Neon Purple/Pink Futuristic Cyberpunk)
 */
function renderCyber(cardType, content, imageBase64, themeColor) {
  let innerHtml = '';
  
  if (cardType === 'title') {
    innerHtml = `
      <div class="slide-container relative w-[1080px] h-[1920px] overflow-hidden flex flex-col justify-between p-16 select-none">
        <img class="absolute inset-0 w-full h-full object-cover z-0" src="data:image/png;base64,${imageBase64}" alt="illustration" />
        <div class="absolute inset-0 bg-gradient-to-b from-[#140727]/30 via-[#140727]/70 to-[#140727] z-10"></div>
        
        <header class="w-full pt-16 flex justify-between items-center z-20">
          <span class="material-symbols-outlined text-neon-green text-5xl">insights</span>
          <div class="font-display font-extrabold text-neon-green text-4xl tracking-tighter">today.econ 📈</div>
          <span class="material-symbols-outlined text-slate-300 text-5xl">more_vert</span>
        </header>

        <main class="flex-1 flex flex-col z-20 justify-end pb-12">
          <div class="glass-card rounded-3xl p-10 space-y-6 text-center shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <span class="inline-block px-6 py-2 rounded border border-secondary text-secondary font-label-caps text-xl tracking-widest uppercase shadow-[0_0_12px_rgba(255,75,137,0.5)]">#MARKET_UPDATE</span>
            <h1 class="font-display text-5xl font-extrabold text-white leading-tight break-keep px-2">${content.title.replace(/\n/g, '<br/>')}</h1>
            <div class="w-32 h-1.5 bg-primary mx-auto mt-6 shadow-[0_0_15px_rgba(235,178,255,0.9)]"></div>
            ${content.editors_insight ? `
              <div class="mt-6 pt-6 border-t border-white/10 flex items-center justify-center gap-4 text-primary font-bold text-2.5xl bg-primary/5 rounded-2xl py-4 px-5">
                <span class="text-3xl">💡</span>
                <p class="text-left text-slate-200 leading-normal font-bold text-2xl">${content.editors_insight}</p>
              </div>
            ` : ''}
          </div>
          <div class="footer-area text-slate-500 font-bold text-center text-2xl mt-8">📍 @today.econ</div>
        </main>
      </div>
    `;
  } else {
    const isFact = cardType === 'fact';
    const badgeText = isFact ? content.section_title || '무슨 일이야?' : content.section_title || '그래서 어떻게 돼?';
    const badgeBorderColor = isFact ? '#ebb2ff' : '#2ae500';
    const badgeGlowColor = isFact ? 'rgba(235,178,255,0.4)' : 'rgba(42,229,0,0.4)';
    const dotBorder = isFact ? 'border-primary/50' : 'border-tertiary/50';
    const dotPulseColor = isFact ? 'bg-primary' : 'bg-tertiary';
    const bulletGlow = isFact ? 'rgba(235,178,255,0.4)' : 'rgba(42,229,0,0.4)';

    const bulletsHtml = content.bullets
      .map(bullet => `
        <li class="flex items-center gap-6 py-3">
          <div class="w-10 h-10 rounded-full bg-slate-900/60 flex items-center justify-center border ${dotBorder} shrink-0 shadow-[0_0_12px_${bulletGlow}]">
            <span class="w-3.5 h-3.5 rounded-full ${dotPulseColor} animate-pulse"></span>
          </div>
          <p class="font-body text-3.5xl text-slate-100 font-extrabold leading-normal break-keep">${bullet}</p>
        </li>
      `).join('<div class="w-full h-px bg-white/10 my-2"></div>');

    innerHtml = `
      <div class="slide-container relative w-[1080px] h-[1920px] overflow-hidden flex flex-col justify-between p-16 select-none">
        <img class="absolute inset-0 w-full h-full object-cover z-0" src="data:image/png;base64,${imageBase64}" alt="illustration" />
        <div class="absolute inset-0 bg-gradient-to-b from-[#140727]/30 via-[#140727]/70 to-[#140727] z-10"></div>
        
        <header class="w-full pt-16 flex justify-between items-center z-20">
          <span class="material-symbols-outlined text-neon-green text-5xl">insights</span>
          <div class="font-display font-extrabold text-neon-green text-4xl tracking-tighter">today.econ 📈</div>
          <span class="material-symbols-outlined text-slate-300 text-5xl">more_vert</span>
        </header>

        <main class="flex-1 flex flex-col z-20 justify-end pb-12">
          <div class="glass-card rounded-3xl p-10 space-y-6 shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
            <div class="mb-4">
              <span class="inline-block px-6 py-2 rounded border text-slate-200 font-label-caps text-xl tracking-widest uppercase" style="border-color: ${badgeBorderColor}; background: ${badgeBorderColor}15; box-shadow: 0 0 10px ${badgeGlowColor};">${badgeText}</span>
            </div>
            
            <ul class="space-y-4">
              ${bulletsHtml}
            </ul>

            ${content.editors_insight ? `
              <div class="mt-6 pt-6 border-t border-white/10 flex items-start gap-4 text-primary font-bold text-2.5xl bg-primary/5 rounded-2xl py-4 px-5">
                <span class="text-3xl">💡</span>
                <p class="text-left text-slate-200 leading-normal font-bold text-2xl">${content.editors_insight}</p>
              </div>
            ` : ''}
          </div>
          
          <div class="w-full flex flex-col items-center space-y-6 mt-8">
            <div class="footer-area text-slate-500 font-bold text-center text-2xl">📍 @today.econ</div>
          </div>
        </main>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html class="dark" lang="ko">
    <head>
      <meta charset="utf-8"/>
      <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
      <title>today.econ Cyber Card</title>
      <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
      <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.css" />
      <script>
        tailwind.config = {
          theme: {
            extend: {
              colors: {
                primary: "#ebb2ff",
                secondary: "#ffb1c3",
                tertiary: "#2ae500",
                background: "#190c2c"
              },
              fontSize: {
                '2.5xl': '1.75rem',
                '3.5xl': '2.1rem',
              },
              fontFamily: {
                display: ["Pretendard", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
                body: ["Pretendard", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"]
              }
            }
          }
        }
      </script>
      <style>
        body { background-color: #140727; overflow: hidden; }
        .glass-card {
          background: rgba(20, 7, 39, 0.85);
          backdrop-filter: blur(25px);
          -webkit-backdrop-filter: blur(25px);
          border: 1px solid rgba(235, 178, 255, 0.2);
        }
        .text-neon-green {
          color: #39FF14;
          text-shadow: 0 0 10px rgba(57, 255, 20, 0.5);
        }
        .bg-radial-glow {
          background: radial-gradient(circle at 50% 0%, rgba(188, 19, 254, 0.3) 0%, rgba(24, 11, 43, 0) 60%),
                      radial-gradient(circle at 100% 100%, rgba(255, 75, 137, 0.2) 0%, rgba(24, 11, 43, 0) 50%);
        }
        .slide-container {
          background-color: #140727;
        }
      </style>
    </head>
    <body class="bg-radial-glow text-on-background font-body-md antialiased flex items-center justify-center min-h-screen">
      ${innerHtml}
    </body>
    </html>
  `;
}

/**
 * Builds HTML code dynamically based on selected theme
 */
function buildThemeHtml(themeName, themeColor, cardType, content, imageBase64) {
  const normalized = (themeName || 'obsidian').toLowerCase();
  
  if (normalized === 'ivory') {
    return renderIvory(cardType, content, imageBase64, themeColor);
  } else if (normalized === 'cyber') {
    return renderCyber(cardType, content, imageBase64, themeColor);
  } else {
    return renderObsidian(cardType, content, imageBase64, themeColor);
  }
}

module.exports = {
  buildThemeHtml,
};
