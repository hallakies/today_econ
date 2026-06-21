/**
 * Unified HTML/CSS template for today.econ card news.
 * Premium Fintech / Modern Editorial Theme
 * Optimized for Instagram 9:16 (1080x1920).
 */

function highlightText(text, themeColor) {
  if (!text) return text;
  return text.replace(/<hl>(.*?)<\/hl>/gi, `<span style="color: ${themeColor}; font-weight: 900; text-shadow: 0 0 20px ${themeColor}80;">$1</span>`);
}

function renderUnified(cardType, content, imageBase64, themeColor, newsDate = 'TODAY', mascotBase64 = '', coreInsight = '') {
  const mascotHtml = mascotBase64 
    ? `<img src="data:image/png;base64,${mascotBase64}" alt="오늘이" style="width: 110px; height: 110px; object-fit: contain; filter: drop-shadow(0 10px 20px rgba(0,0,0,0.6));" />`
    : '';

  let innerHtml = '';
  
  if (cardType === 'title') {
    innerHtml = `
      <div class="slide-container relative w-[1080px] h-[1920px] overflow-hidden flex flex-col justify-between py-20 px-16 select-none">
        
        <!-- Full Bleed AI Background Image -->
        <div class="absolute inset-0 z-0">
          <img class="w-full h-full object-cover scale-105" src="data:image/png;base64,${imageBase64}" alt="background" />
          <!-- Premium Gradient Overlay -->
          <div class="absolute inset-0 bg-gradient-to-b from-[#0B101A]/60 via-[#0B101A]/40 to-[#0B101A]/95"></div>
        </div>
        
        <!-- Top Header -->
        <header class="w-full flex items-start justify-between z-20">
          <div class="flex flex-col gap-3 mt-4">
            <span class="inline-block px-5 py-2 rounded-xl text-white/90 font-black text-2xl tracking-wider bg-white/10 backdrop-blur-md border border-white/20 w-max">${newsDate}</span>
            <span class="text-white/60 font-black text-3xl tracking-wider drop-shadow-md">@today.econ</span>
          </div>
          <div class="z-20">
            ${mascotHtml}
          </div>
        </header>

        <!-- Centered Typography Area -->
        <main class="w-full z-20 flex-1 flex flex-col justify-center items-center space-y-10 text-center">
          <h1 class="font-display text-[4.8rem] font-black text-white leading-[1.3] break-keep drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)]">${highlightText(content.title.replace(/\\n/g, '<br/>'), themeColor)}</h1>
          
          <div class="h-1.5 w-32 rounded-full" style="background: ${themeColor}; box-shadow: 0 0 20px ${themeColor};"></div>
          
          <p class="font-body text-[2.8rem] text-white/90 break-keep leading-snug font-bold drop-shadow-md px-10">${highlightText(content.subtitle, themeColor)}</p>
        </main>
      </div>
    `;
  } else {
    const isFact = cardType === 'fact';
    const badgeText = isFact ? content.section_title || '무슨 일이야?' : content.section_title || '그래서 어떻게 돼?';
    
    const bulletsHtml = content.bullets
      .map((bullet, idx) => `
        <li class="flex items-start gap-5 py-4">
          <div class="mt-4 w-3 h-3 rounded-full shrink-0" style="background: ${themeColor}; box-shadow: 0 0 12px ${themeColor};"></div>
          <p class="font-body text-[2.4rem] text-white/95 font-medium leading-[1.65] break-keep bullet-text drop-shadow-sm">${highlightText(bullet, themeColor)}</p>
        </li>
      `).join('');

    innerHtml = `
      <div class="slide-container relative w-[1080px] h-[1350px] overflow-hidden flex flex-col justify-between py-16 px-16 select-none">
        
        <!-- Ambient Background -->
        <div class="absolute inset-0 z-0">
          <img class="w-full h-full object-cover filter blur-[8px] scale-105 opacity-80" src="data:image/png;base64,${imageBase64}" alt="ambient" />
          <div class="absolute inset-0 bg-[#0B101A]/50"></div>
        </div>
        
        <header class="w-full flex items-center justify-between z-20 mb-8">
           <span class="inline-block px-7 py-3 rounded-full font-black text-[2rem] tracking-wider text-white" style="background: ${themeColor}D0; border: 1px solid ${themeColor}; box-shadow: 0 0 20px ${themeColor}60;">${badgeText}</span>
           <span class="text-white/60 font-black text-[2rem]">@today.econ</span>
        </header>

        <main class="flex-1 flex flex-col justify-center z-20 w-full relative">
          <!-- Glassmorphism Card -->
          <div class="w-full rounded-[40px] p-12 bg-[#0B101A]/40 backdrop-blur-[40px] border-[1.5px] border-white/20 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
            
            <ul class="space-y-4 flex flex-col justify-center min-h-[300px]">
              ${bulletsHtml}
            </ul>

            <!-- Hard Terms (Only if exist) -->
            ${content.hard_terms && content.hard_terms.length > 0 ? `
              <div class="mt-14 pt-10 border-t border-white/10">
                <div class="flex items-center gap-4 mb-6">
                  <span class="text-4xl" style="color: ${themeColor};">💡</span>
                  <span class="text-white/60 font-black text-3xl tracking-wider">쉽게 말하면?</span>
                </div>
                <div class="flex flex-col gap-5">
                  ${content.hard_terms.map(term => `
                    <div class="flex items-start gap-5 bg-black/20 rounded-2xl p-6">
                      <span style="color: ${themeColor};" class="font-black text-3xl shrink-0">${term.term}</span>
                      <span class="text-white/30 text-3xl">→</span>
                      <span class="text-white/80 font-bold text-[2.4rem] leading-snug break-keep">${term.explanation}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Core Insight (Only show on Action Card to act as a punchline) -->
            ${(!isFact && coreInsight) ? `
              <div class="mt-12 pt-10 border-t border-white/10">
                <div class="relative rounded-3xl p-8 bg-[#0B101A]/80 backdrop-blur-xl border-l-[6px] shadow-2xl" style="border-left-color: ${themeColor};">
                  <div class="absolute -top-7 -left-3 text-7xl opacity-40 drop-shadow-md" style="color: ${themeColor};">"</div>
                  <p class="relative z-10 text-white/95 leading-[1.6] font-bold text-[2.6rem] break-keep">${highlightText(coreInsight, themeColor)}</p>
                </div>
              </div>
            ` : ''}

          </div>
        </main>
        
        <footer class="w-full z-20 mt-8 flex justify-end">
           <div class="w-24 h-24 flex items-center justify-center opacity-80">
             ${mascotHtml}
           </div>
        </footer>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html class="dark" lang="ko">
    <head>
      <meta charset="utf-8"/>
      <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
      <title>today.econ Premium</title>
      <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
      <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.css" />
      <script>
        tailwind.config = {
          darkMode: "class",
          theme: {
            extend: {
              colors: {
                primary: "${themeColor}",
                background: "#0B101A"
              },
              fontFamily: {
                sans: ["Pretendard", "system-ui", "sans-serif"],
                display: ["Pretendard", "system-ui", "sans-serif"],
                body: ["Pretendard", "system-ui", "sans-serif"]
              }
            }
          }
        }
      </script>
      <style>
        body { background-color: #0B101A; overflow: hidden; margin: 0; padding: 0; }
      </style>
    </head>
    <body class="font-sans text-white antialiased flex items-center justify-center min-h-screen">
      ${innerHtml}
    </body>
    </html>
  `;
}

function buildThemeHtml(themeName, themeColor, cardType, content, imageBase64, newsDate, mascotBase64, coreInsight) {
  return renderUnified(cardType, content, imageBase64, themeColor, newsDate, mascotBase64, coreInsight);
}

module.exports = {
  buildThemeHtml,
};
