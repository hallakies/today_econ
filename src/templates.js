/**
 * Unified HTML/CSS template for today.econ card news.
 * Premium Fintech / Modern Editorial Theme
 * Optimized for Instagram feed carousel 4:5 (1080x1350).
 */

function highlightText(text, themeColor) {
  if (!text) return text;
  return String(text).replace(/<hl>(.*?)<\/hl>/gi, `<span style="background-color: ${themeColor}25; border-bottom: 2px solid ${themeColor}; padding: 0 4px; border-radius: 4px; font-weight: 900; color: #ffffff; -webkit-box-decoration-break: clone; box-decoration-break: clone; line-height: 1.4;">$1</span>`);
}

const CARD_LABELS = Object.freeze({
  fact: '무슨 일이야?',
  audience: '그래서 내 돈은?',
  action: '앞으로 이렇게 될 수도',
});

function canonicalCardLabel(cardType, content = {}) {
  // In the compact three-card fallback, the action renderer receives card3
  // (the reader-impact section). Preserve its audience label while retaining
  // the action-card density contract.
  if (cardType === 'action' && content?.section_title === '그래서 내 돈은?') return '그래서 내 돈은?';
  return CARD_LABELS[cardType] || CARD_LABELS.action;
}

function renderUnified(cardType, content, imageBase64, themeColor, newsDate = 'TODAY', mascotBase64 = '', coreInsight = '', slideNumber = 1, totalSlides = 4, seriesLabel = '오늘의 돈 신호') {
  const backgroundSrc = String(imageBase64 || '').startsWith('data:')
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`;
  const mascotHtml = mascotBase64 
    ? `<img src="data:image/png;base64,${mascotBase64}" alt="오늘이" style="width: 76px; height: 76px; object-fit: contain; filter: drop-shadow(0 8px 14px rgba(0,0,0,0.55));" />`
    : '';

  let innerHtml = '';
  
  if (cardType === 'title') {
    innerHtml = `
      <div class="slide-container" data-card-type="title" style="position:relative;width:1080px;height:1350px;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;padding:3rem 3.5rem;user-select:none;">
        
        <!-- Full Bleed AI Background Image -->
        <div class="absolute inset-0 z-0">
          <img class="w-full h-full object-cover scale-105" src="${backgroundSrc}" alt="background" />
          <!-- Premium Gradient Overlay -->
          <div class="absolute inset-0 bg-gradient-to-b from-[#0B101A]/60 via-[#0B101A]/40 to-[#0B101A]/95"></div>
        </div>
        
        <!-- Top Header -->
        <header class="w-full flex items-start justify-between z-20">
          <div class="flex flex-col gap-3 mt-4">
            <span class="inline-block px-4 py-2 rounded-lg text-white/90 font-black text-xl tracking-wider bg-black/25 backdrop-blur-md border border-white/20 w-max">${seriesLabel} · ${newsDate}</span>
            <span class="text-white/70 font-black text-2xl tracking-wider drop-shadow-md">@today.econ</span>
          </div>
          <div class="z-20">
            ${mascotHtml}
          </div>
        </header>

        <!-- Centered Typography Area -->
        <main class="w-full z-20 flex-1 flex flex-col justify-center items-center space-y-6 text-center">
          <div class="text-white/80 font-black text-2xl tracking-[0.16em] uppercase">${content.kicker || '오늘의 쟁점'}</div>
          <h1 class="cover-title font-display text-[3.8rem] font-black text-white leading-[1.16] break-keep max-w-[900px] drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)]" data-cover-title>${highlightText(String(content?.title || '').replace(/\\n|\n/g, '<br/>'), themeColor)}</h1>
          
          <div class="h-1.5 w-32 rounded-full" style="background: ${themeColor}; box-shadow: 0 0 20px ${themeColor};"></div>
          
          <p class="cover-subtitle font-body text-[2rem] text-white/90 break-keep leading-snug font-bold drop-shadow-md px-10 max-w-[920px]" data-cover-subtitle>${highlightText(String(content?.subtitle || ''), themeColor)}</p>
        </main>
      </div>
    `;
  } else {
    const isFact = cardType === 'fact';
    const isAudience = cardType === 'audience';
    const isAction = cardType === 'action';
    const badgeText = canonicalCardLabel(cardType, content);
    const bullets = Array.isArray(content?.bullets) ? content.bullets : [];
    const bulletsHtml = bullets
      .map((bullet, idx) => {
        const actionClass = cardType === 'action' ? ` action-bullet action-bullet-${idx + 1}` : '';
        const actionLabel = cardType === 'action' && idx === 2 ? '지금 할 일' : '';
        return `
        <li data-bullet-index="${idx + 1}" class="${isAudience ? 'rounded-2xl border border-white/12 bg-white/[.035] p-5' : 'border-b border-white/10 py-4 last:border-b-0'}${actionClass} flex items-start gap-5">
          <div class="mt-2 flex items-center justify-center w-10 h-10 rounded-full shrink-0 font-black text-xl" style="color: ${themeColor}; border: 1px solid ${themeColor};">${String(idx + 1).padStart(2, '0')}</div>
          <div class="flex-1 min-w-0">
            ${actionLabel ? `<div class="action-bullet-label" style="color:${themeColor};">${actionLabel}</div>` : ''}
            <p class="font-body ${cardType === 'fact' ? 'fact-bullet-text' : 'bullet-text'} text-[2.08rem] text-white/95 font-medium leading-[1.38] break-keep drop-shadow-sm">${highlightText(bullet, themeColor)}</p>
          </div>
        </li>
      `}).join('');

    const stats = isFact && Array.isArray(content?.stats) ? content.stats.slice(0, 2) : [];
    const statsHtml = isFact && stats.length > 0 ? `
      <div class="stats-grid mt-7 grid grid-cols-${Math.min(stats.length, 2)} gap-4" data-stat-group>
        ${stats.map(stat => `
          <div class="stat-panel rounded-2xl p-5 border border-white/15" data-stat-panel style="background: linear-gradient(135deg, ${themeColor}25, rgba(8,13,24,.45));">
            <div class="text-white/60 font-bold text-xl">${stat.label || ''}</div>
            <div class="stat-value font-black text-[3.1rem] leading-tight mt-1" style="color: ${themeColor};">${stat.value || ''}</div>
            ${stat.baseline ? `<div class="text-white/55 font-semibold text-lg mt-1 break-keep">기준: ${stat.baseline}</div>` : ''}
            ${stat.comparison ? `<div class="text-white/75 font-semibold text-xl mt-1 break-keep">${stat.comparison}</div>` : ''}
          </div>
        `).join('')}
      </div>` : '';

    const policyHtml = isFact && Array.isArray(content?.policy_points) && content.policy_points.length > 0 ? `
      <div class="mt-8 pt-7 border-t border-white/10">
        <div class="text-white/55 font-black text-xl tracking-wider mb-3">기사에 적힌 제한</div>
        <div class="flex flex-wrap gap-3">${content.policy_points.map(point => `<span class="px-4 py-3 rounded-xl text-white/90 font-bold text-xl border" style="border-color:${themeColor}70;background:${themeColor}18;">${point}</span>`).join('')}</div>
      </div>` : '';

    // The saveable checklist belongs in the caption. Rendering it again here
    // made the action card dense and duplicated the reader's next step.
    const stepsHtml = '';

    innerHtml = `
      <div class="slide-container" data-card-type="${cardType}" style="position:relative;width:1080px;height:1350px;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;padding:4rem 4rem;user-select:none;">
        
        <!-- Ambient Background -->
        <div class="absolute inset-0 z-0">
          <img class="w-full h-full object-cover filter blur-[8px] scale-105 opacity-80" src="${backgroundSrc}" alt="ambient" />
          <div class="absolute inset-0 bg-[#0B101A]/50"></div>
        </div>
        
        <header class="w-full z-20 mb-8 flex items-start justify-between" style="position: relative;">
           <div>
             <div class="text-white/45 font-black text-lg tracking-[0.22em] uppercase mb-2">${seriesLabel} · ${String(slideNumber).padStart(2, '0')}/${String(totalSlides).padStart(2, '0')}</div>
             <span class="inline-block whitespace-nowrap px-6 py-3 rounded-xl font-black text-[1.55rem] tracking-wider text-white" style="background: ${themeColor}28; border-left: 4px solid ${themeColor};">${badgeText}</span>
           </div>
           <span style="color: rgba(255,255,255,0.6); font-weight: 900; font-size: 1.65rem; margin-top: 22px;">@today.econ</span>
        </header>

        <main class="flex-1 flex flex-col justify-center z-20 w-full relative">
          <!-- Glassmorphism Card -->
          <div class="w-full rounded-[30px] p-11 bg-[#0B101A]/58 backdrop-blur-[22px] border border-white/18 shadow-[0_24px_70px_rgba(0,0,0,0.58)]">
            
            ${(cardType === 'action' && coreInsight) ? `
              <div class="mb-8 rounded-2xl p-6 bg-[#0B101A]/80 border-l-[5px]" style="border-left-color:${themeColor};">
                <div class="text-white/55 font-black text-xl tracking-wider mb-2">오늘경제 한 줄 생각</div>
                <p class="relative z-10 text-white/95 leading-[1.45] font-bold text-[2.35rem] break-keep core-insight-text">${highlightText(coreInsight, themeColor)}</p>
              </div>
            ` : ''}

            <ul class="card-bullets ${isFact ? 'fact-bullets' : ''} ${isAction ? 'action-bullets' : ''} space-y-3 flex flex-col justify-center min-h-[260px]" data-bullet-group>
              ${bulletsHtml}
            </ul>

            <!-- Hard Terms (Only if exist) -->
            ${statsHtml}

            ${cardType !== 'action' && content.hard_terms && content.hard_terms.length > 0 ? `
              <div class="mt-14 pt-10 border-t border-white/10">
                <div class="flex items-center gap-4 mb-6">
                  <span class="text-white/60 font-black text-xl tracking-[0.18em]">용어를 풀면</span>
                </div>
                <div class="flex flex-col gap-5">
                  ${content.hard_terms.map(term => `
                    <div class="flex items-start gap-5 bg-black/20 rounded-2xl p-6">
                      <span style="color: ${themeColor};" class="font-black text-2xl shrink-0">${term.term}</span>
                      <span class="text-white/30 text-3xl">→</span>
                      <span class="text-white/80 font-bold text-[1.75rem] leading-snug break-keep">${term.explanation}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${policyHtml}
            ${stepsHtml}

          </div>
        </main>
        
        <footer class="w-full z-20 mt-8 flex justify-between items-center text-white/35 font-bold text-lg tracking-wider">
           <span>매일경제 기사 바탕</span>
           <span>${String(slideNumber).padStart(2, '0')} / ${String(totalSlides).padStart(2, '0')}</span>
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
        *, *::before, *::after { box-sizing: border-box; }
        body { background-color: #0B101A; overflow: hidden; margin: 0; padding: 0; }
        .slide-container { box-sizing: border-box; }
        .cover-title { max-height: 9rem; overflow: hidden; }
        .cover-subtitle { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .action-bullet { border-left: 4px solid rgba(255,255,255,.14); padding-left: 1.25rem; }
        .action-bullet-3 { border-left-color: ${themeColor}; background: ${themeColor}12; border-radius: 1rem; padding: 1rem 1.25rem; }
        .action-bullet-label { font-size: 1.05rem; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; margin-bottom: .15rem; }
        .stat-panel { min-height: 12rem; }
        .fact-bullet-text { font-size: 2rem; }
      </style>
    </head>
    <body class="font-sans text-white antialiased flex items-center justify-center min-h-screen">
      ${innerHtml}
      <script>
        document.addEventListener("DOMContentLoaded", () => {
          document.querySelectorAll('.bullet-text, .fact-bullet-text').forEach(el => {
            const textLen = el.innerText.length;
            if(textLen > 78) el.style.fontSize = '1.82rem';
            else if(textLen > 58) el.style.fontSize = '1.95rem';
          });
          document.querySelectorAll('.cover-subtitle').forEach(el => {
            let size = 2;
            while (el.scrollWidth > el.clientWidth && size > 1.55) {
              size -= 0.05;
              el.style.fontSize = size + 'rem';
            }
          });
          document.querySelectorAll('.core-insight-text').forEach(el => {
            if(el.innerText.length > 45) el.style.fontSize = '1.92rem';
            else if(el.innerText.length > 30) el.style.fontSize = '2.08rem';
          });
        });
      </script>
    </body>
    </html>
  `;
}

function buildThemeHtml(themeName, themeColor, cardType, content, imageBase64, newsDate, mascotBase64, coreInsight, slideNumber = 1, totalSlides = 4, seriesLabel = '오늘의 돈 신호') {
  return renderUnified(cardType, content, imageBase64, themeColor, newsDate, mascotBase64, coreInsight, slideNumber, totalSlides, seriesLabel);
}

module.exports = {
  buildThemeHtml,
  canonicalCardLabel,
};
