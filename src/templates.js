/**
 * Google Stitch designed HTML/CSS templates for today.econ card news.
 * Optimized for readability on mobile (Instagram) with large fonts and proper space utilization.
 */

/**
 * Obsidian Theme (Dark Mode Premium Glassmorphism)
 */
function renderObsidian(cardType, content, imageBase64, themeColor) {
  let innerHtml = '';
  
  if (cardType === 'title') {
    innerHtml = `
      <div class="slide-container">
        <div class="ambient-glow glow-primary w-[600px] h-[600px] top-[-150px] left-[-150px]"></div>
        <div class="ambient-glow glow-secondary w-[700px] h-[700px] bottom-[-200px] right-[-200px]"></div>
        
        <header class="w-full pt-16 flex justify-between items-center px-12 z-50">
          <span class="material-symbols-outlined text-primary text-5xl">trending_up</span>
          <div class="font-display font-extrabold text-primary text-4xl tracking-tight">today.econ 📈</div>
          <span class="material-symbols-outlined text-primary text-5xl">more_horiz</span>
        </header>

        <main class="flex-1 flex flex-col px-12 pt-12 pb-16 z-10 relative justify-between">
          <div class="space-y-6 text-center mt-8">
            <span class="inline-block px-6 py-2 rounded-full bg-primary-container/20 border border-primary-container/40 text-primary font-label-caps text-xl tracking-widest backdrop-blur-md">TODAY</span>
            <h1 class="font-display text-6xl font-extrabold text-white leading-tight break-keep px-2">${content.title.replace(/\n/g, '<br/>')}</h1>
            <p class="font-body text-3xl text-slate-350 mt-6 px-6 break-keep leading-relaxed">${content.subtitle}</p>
          </div>
          
          <div class="image-wrapper mx-auto my-auto shadow-[0_30px_70px_rgba(0,0,0,0.7)]">
            ${content.speech_bubble ? `<div class="speech-bubble">${content.speech_bubble}</div>` : ''}
            <img src="data:image/png;base64,${imageBase64}" alt="illustration" />
          </div>
          
          <div class="footer-area text-slate-500 font-bold text-center text-2xl mt-8">📍 @today.econ</div>
        </main>
      </div>
    `;
  } else {
    const isFact = cardType === 'fact';
    const badgeText = isFact ? content.section_title || '무슨 일이야?' : content.section_title || '그래서 어떻게 돼?';
    const badgeBg = isFact ? `${themeColor}20` : '#10b98120';
    const badgeColor = isFact ? themeColor : '#10b981';
    const badgeBorder = isFact ? `${themeColor}40` : '#10b98140';
    const bulletIcon = isFact ? '💡' : '✔️';

    const bulletsHtml = content.bullets
      .map(bullet => `
        <li class="flex items-start gap-6 py-2">
          <div class="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center border border-primary/20 shrink-0 shadow-[0_0_12px_${themeColor}40]">
            <span class="text-2xl">${bulletIcon}</span>
          </div>
          <p class="font-body text-3xl text-slate-200 leading-relaxed break-keep mt-0.5">${bullet}</p>
        </li>
      `).join('<div class="w-full h-px bg-white/10 my-3"></div>');

    innerHtml = `
      <div class="slide-container">
        <div class="ambient-glow glow-primary w-[600px] h-[600px] top-[-150px] left-[-150px]"></div>
        <div class="ambient-glow glow-secondary w-[700px] h-[700px] bottom-[-200px] right-[-200px]"></div>
        
        <header class="w-full pt-16 flex justify-between items-center px-12 z-50">
          <span class="material-symbols-outlined text-primary text-5xl">trending_up</span>
          <div class="font-display font-extrabold text-primary text-4xl tracking-tight">today.econ 📈</div>
          <span class="material-symbols-outlined text-primary text-5xl">more_horiz</span>
        </header>

        <main class="flex-1 flex flex-col px-12 pt-8 pb-16 z-10 relative justify-start items-stretch">
          <div class="px-2 mb-6 mt-4">
            <span class="inline-block px-6 py-2 rounded-full font-label-caps text-xl tracking-wider" style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder};">${badgeText}</span>
          </div>
          
          <div class="glass-card rounded-3xl p-10 space-y-6 mb-10">
            <ul class="space-y-6">
              ${bulletsHtml}
            </ul>
          </div>
          
          <div class="image-wrapper-small mx-auto mb-10 shadow-[0_25px_55px_rgba(0,0,0,0.7)] relative">
            ${content.speech_bubble ? `<div class="speech-bubble-small">${content.speech_bubble}</div>` : ''}
            <img src="data:image/png;base64,${imageBase64}" alt="illustration" />
          </div>
          
          <div class="mt-auto w-full flex flex-col items-center space-y-6">
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
      <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;700;800&family=JetBrains+Mono:wght@500&family=Noto+Sans:wght@400;700&display=swap" rel="stylesheet"/>
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
              fontFamily: {
                display: ["Be Vietnam Pro", "sans-serif"],
                body: ["Noto Sans", "sans-serif"]
              }
            }
          }
        }
      </script>
      <style>
        body { background-color: #0A0E1A; overflow: hidden; }
        .glass-card {
          background-color: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border: 0.5px solid rgba(255, 255, 255, 0.08);
        }
        .ambient-glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          z-index: 0;
          pointer-events: none;
        }
        .glow-primary {
          background: radial-gradient(circle, ${themeColor}20 0%, transparent 70%);
        }
        .glow-secondary {
          background: radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%);
        }
        .slide-container {
          width: 1080px;
          height: 1920px;
          position: relative;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background-color: #050811;
        }
        .image-wrapper {
          position: relative;
          width: 840px;
          height: 840px;
          border-radius: 40px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 30px 60px rgba(0,0,0,0.6);
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
          overflow: visible;
        }
        .image-wrapper img { width: 100%; height: 100%; object-fit: cover; border-radius: 40px; }
        
        .image-wrapper-small {
          position: relative;
          width: 800px;
          height: 620px;
          border-radius: 32px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 20px 45px rgba(0,0,0,0.5);
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
          overflow: visible;
        }
        .image-wrapper-small img { width: 100%; height: 100%; object-fit: cover; border-radius: 32px; }

        .speech-bubble {
          position: absolute;
          top: -50px;
          right: -20px;
          background: #ffffff;
          color: #0f172a;
          padding: 20px 36px;
          border-radius: 35px;
          font-size: 36px;
          font-weight: 900;
          box-shadow: 0 20px 40px rgba(0,0,0,0.6);
          border: 5px solid ${themeColor};
          z-index: 10;
          white-space: nowrap;
        }
        .speech-bubble::after {
          content: '';
          position: absolute;
          bottom: -18px;
          left: 55px;
          border-width: 18px 18px 0;
          border-style: solid;
          border-color: #ffffff transparent;
          display: block;
          width: 0;
        }

        .speech-bubble-small {
          position: absolute;
          top: -40px;
          right: -15px;
          background: #ffffff;
          color: #0f172a;
          padding: 16px 28px;
          border-radius: 28px;
          font-size: 30px;
          font-weight: 900;
          box-shadow: 0 15px 30px rgba(0,0,0,0.5);
          border: 4px solid ${themeColor};
          z-index: 10;
          white-space: nowrap;
        }
        .speech-bubble-small::after {
          content: '';
          position: absolute;
          bottom: -14px;
          left: 45px;
          border-width: 14px 14px 0;
          border-style: solid;
          border-color: #ffffff transparent;
          display: block;
          width: 0;
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
      <div class="slide-container">
        <header class="w-full pt-16 flex justify-between items-center px-12 z-50">
          <span class="material-symbols-outlined text-slate-800 text-5xl">trending_up</span>
          <div class="font-display font-extrabold text-slate-800 text-4xl tracking-tight">today.econ 📈</div>
          <span class="material-symbols-outlined text-slate-800 text-5xl">more_horiz</span>
        </header>

        <main class="flex-1 flex flex-col px-12 pt-12 pb-16 z-10 relative justify-between">
          <div class="space-y-6 text-center mt-8">
            <span class="inline-block px-6 py-2 rounded bg-slate-800 text-white font-label-caps text-xl tracking-widest">TODAY</span>
            <h1 class="font-display text-6xl font-extrabold text-slate-800 leading-tight break-keep px-2">${content.title.replace(/\n/g, '<br/>')}</h1>
            <p class="font-body text-3xl text-slate-650 mt-6 px-6 break-keep leading-relaxed font-semibold">${content.subtitle}</p>
          </div>
          
          <div class="image-wrapper mx-auto my-auto shadow-[0_30px_70px_rgba(0,0,0,0.15)]">
            ${content.speech_bubble ? `<div class="speech-bubble">${content.speech_bubble}</div>` : ''}
            <img src="data:image/png;base64,${imageBase64}" alt="illustration" />
          </div>
          
          <div class="footer-area text-slate-500 font-bold text-center text-2xl mt-8">📍 @today.econ</div>
        </main>
      </div>
    `;
  } else {
    const isFact = cardType === 'fact';
    const badgeText = isFact ? content.section_title || '무슨 일이야?' : content.section_title || '그래서 어떻게 돼?';
    const badgeBg = isFact ? '#705d0015' : '#10b98115';
    const badgeColor = isFact ? '#705d00' : '#10b981';
    const badgeBorder = isFact ? '#705d0030' : '#10b98130';
    const bulletIcon = isFact ? 'circle' : 'task_alt';

    const bulletsHtml = content.bullets
      .map(bullet => `
        <li class="flex items-start py-2">
          <span class="material-symbols-outlined mr-6 mt-1.5 text-4xl shrink-0 font-bold" style="color: ${badgeColor}">${bulletIcon}</span>
          <p class="font-body text-3xl text-slate-755 leading-relaxed break-keep font-semibold">${bullet}</p>
        </li>
      `).join('<div class="w-full h-px bg-slate-200/80 my-3"></div>');

    innerHtml = `
      <div class="slide-container">
        <header class="w-full pt-16 flex justify-between items-center px-12 z-50">
          <span class="material-symbols-outlined text-slate-800 text-5xl">trending_up</span>
          <div class="font-display font-extrabold text-slate-800 text-4xl tracking-tight">today.econ 📈</div>
          <span class="material-symbols-outlined text-slate-800 text-5xl">more_horiz</span>
        </header>

        <main class="flex-1 flex flex-col px-12 pt-8 pb-16 z-10 relative justify-start items-stretch">
          <div class="px-2 mb-6 mt-4">
            <span class="inline-block px-6 py-2 rounded font-label-caps text-xl tracking-wider" style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder};">${badgeText}</span>
          </div>
          
          <div class="glass-card rounded-3xl p-10 space-y-6 mb-10">
            <ul class="space-y-6">
              ${bulletsHtml}
            </ul>
          </div>
          
          <div class="image-wrapper-small mx-auto mb-10 shadow-[0_25px_55px_rgba(0,0,0,0.1)] relative">
            ${content.speech_bubble ? `<div class="speech-bubble-small">${content.speech_bubble}</div>` : ''}
            <img src="data:image/png;base64,${imageBase64}" alt="illustration" />
          </div>
          
          <div class="mt-auto w-full flex flex-col items-center space-y-6">
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
      <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700;800&display=swap" rel="stylesheet"/>
      <script>
        tailwind.config = {
          theme: {
            extend: {
              colors: {
                primary: "#121212",
                secondary: "#705d00"
              },
              fontFamily: {
                display: ["Be Vietnam Pro", "sans-serif"],
                body: ["Be Vietnam Pro", "sans-serif"]
              }
            }
          }
        }
      </script>
      <style>
        body {
          background-color: #FDFBF7;
          background-image: 
            radial-gradient(circle at 10% 20%, rgba(255, 223, 160, 0.4) 0%, transparent 50%),
            radial-gradient(circle at 90% 80%, rgba(252, 212, 0, 0.3) 0%, transparent 60%);
          background-attachment: fixed;
          overflow: hidden;
        }
        .glass-card {
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.9);
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.05);
        }
        .slide-container {
          width: 1080px;
          height: 1920px;
          position: relative;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .image-wrapper {
          position: relative;
          width: 840px;
          height: 840px;
          border-radius: 24px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.1);
          background: linear-gradient(135deg, #fef9c3 0%, #fef08a 100%);
          overflow: visible;
        }
        .image-wrapper img { width: 100%; height: 100%; object-fit: cover; border-radius: 24px; }
        
        .image-wrapper-small {
          position: relative;
          width: 800px;
          height: 620px;
          border-radius: 24px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.08);
          background: linear-gradient(135deg, #fef9c3 0%, #fef08a 100%);
          overflow: visible;
        }
        .image-wrapper-small img { width: 100%; height: 100%; object-fit: cover; border-radius: 24px; }

        .speech-bubble {
          position: absolute;
          top: -50px;
          right: -20px;
          background: #ffffff;
          color: #0f172a;
          padding: 20px 36px;
          border-radius: 35px;
          font-size: 36px;
          font-weight: 900;
          box-shadow: 0 20px 40px rgba(0,0,0,0.18);
          border: 5px solid #121212;
          z-index: 10;
          white-space: nowrap;
        }
        .speech-bubble::after {
          content: '';
          position: absolute;
          bottom: -18px;
          left: 55px;
          border-width: 18px 18px 0;
          border-style: solid;
          border-color: #ffffff transparent;
          display: block;
          width: 0;
        }

        .speech-bubble-small {
          position: absolute;
          top: -40px;
          right: -15px;
          background: #ffffff;
          color: #0f172a;
          padding: 16px 28px;
          border-radius: 28px;
          font-size: 30px;
          font-weight: 900;
          box-shadow: 0 15px 30px rgba(0,0,0,0.12);
          border: 4px solid #121212;
          z-index: 10;
          white-space: nowrap;
        }
        .speech-bubble-small::after {
          content: '';
          position: absolute;
          bottom: -14px;
          left: 45px;
          border-width: 14px 14px 0;
          border-style: solid;
          border-color: #ffffff transparent;
          display: block;
          width: 0;
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
      <div class="slide-container">
        <header class="w-full pt-16 flex justify-between items-center px-12 z-50">
          <span class="material-symbols-outlined text-neon-green text-5xl">insights</span>
          <div class="font-display font-extrabold text-neon-green text-4xl tracking-tighter">today.econ 📈</div>
          <span class="material-symbols-outlined text-slate-300 text-5xl">more_vert</span>
        </header>

        <main class="flex-1 flex flex-col px-12 pt-12 pb-16 z-10 relative justify-between">
          <div class="space-y-6 text-center mt-8 relative">
            <span class="inline-block px-6 py-2 rounded border border-secondary text-secondary font-label-caps text-xl tracking-widest uppercase shadow-[0_0_12px_rgba(255,75,137,0.5)]">#MARKET_UPDATE</span>
            <h1 class="font-display text-6xl font-extrabold text-white leading-tight break-keep px-2">${content.title.replace(/\n/g, '<br/>')}</h1>
            <div class="w-32 h-1.5 bg-primary mx-auto mt-6 shadow-[0_0_15px_rgba(235,178,255,0.9)]"></div>
          </div>
          
          <div class="image-wrapper mx-auto my-auto shadow-[0_30px_70px_rgba(0,0,0,0.8)]">
            ${content.speech_bubble ? `<div class="speech-bubble">${content.speech_bubble}</div>` : ''}
            <img src="data:image/png;base64,${imageBase64}" alt="illustration" />
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
        <li class="flex items-start gap-6 py-2">
          <div class="w-12 h-12 mt-1 rounded-full bg-slate-900/60 flex items-center justify-center border ${dotBorder} shrink-0 shadow-[0_0_12px_${bulletGlow}]">
            <span class="w-4 h-4 rounded-full ${dotPulseColor} animate-pulse"></span>
          </div>
          <p class="font-body text-3xl text-slate-200 leading-relaxed break-keep mt-0.5">${bullet}</p>
        </li>
      `).join('<div class="w-full h-px bg-white/10 my-3"></div>');

    innerHtml = `
      <div class="slide-container">
        <header class="w-full pt-16 flex justify-between items-center px-12 z-50">
          <span class="material-symbols-outlined text-neon-green text-5xl">insights</span>
          <div class="font-display font-extrabold text-neon-green text-4xl tracking-tighter">today.econ 📈</div>
          <span class="material-symbols-outlined text-slate-300 text-5xl">more_vert</span>
        </header>

        <main class="flex-1 flex flex-col px-12 pt-8 pb-16 z-10 relative justify-start items-stretch">
          <div class="px-2 mb-6 mt-4">
            <span class="inline-block px-6 py-2 rounded border text-slate-200 font-label-caps text-xl tracking-widest uppercase" style="border-color: ${badgeBorderColor}; background: ${badgeBorderColor}15; box-shadow: 0 0 10px ${badgeGlowColor};">${badgeText}</span>
          </div>
          
          <div class="glass-card rounded-3xl p-10 space-y-6 mb-10">
            <ul class="space-y-6">
              ${bulletsHtml}
            </ul>
          </div>
          
          <div class="image-wrapper-small mx-auto mb-10 shadow-[0_25px_55px_rgba(0,0,0,0.8)] relative">
            ${content.speech_bubble ? `<div class="speech-bubble-small">${content.speech_bubble}</div>` : ''}
            <img src="data:image/png;base64,${imageBase64}" alt="illustration" />
          </div>
          
          <div class="mt-auto w-full flex flex-col items-center space-y-6">
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
      <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
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
              fontFamily: {
                display: ["Be Vietnam Pro", "sans-serif"],
                body: ["Be Vietnam Pro", "sans-serif"]
              }
            }
          }
        }
      </script>
      <style>
        body { background-color: #190c2c; overflow: hidden; }
        .glass-card {
          background: rgba(24, 11, 43, 0.75);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(235, 178, 255, 0.3);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
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
          width: 1080px;
          height: 1920px;
          position: relative;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background-color: #140727;
        }
        .image-wrapper {
          position: relative;
          width: 840px;
          height: 840px;
          border-radius: 24px;
          border: 1px solid rgba(235, 178, 255, 0.2);
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
          background: linear-gradient(135deg, #2e1065 0%, #4c1d95 100%);
          overflow: visible;
        }
        .image-wrapper img { width: 100%; height: 100%; object-fit: cover; border-radius: 24px; mix-blend-mode: screen; }
        
        .image-wrapper-small {
          position: relative;
          width: 800px;
          height: 620px;
          border-radius: 24px;
          border: 1px solid rgba(235, 178, 255, 0.2);
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.4);
          background: linear-gradient(135deg, #2e1065 0%, #4c1d95 100%);
          overflow: visible;
        }
        .image-wrapper-small img { width: 100%; height: 100%; object-fit: cover; border-radius: 24px; mix-blend-mode: screen; }

        .speech-bubble {
          position: absolute;
          top: -50px;
          right: -20px;
          background: #ffffff;
          color: #0f172a;
          padding: 20px 36px;
          border-radius: 35px;
          font-size: 36px;
          font-weight: 900;
          box-shadow: 0 20px 40px rgba(0,0,0,0.5);
          border: 5px solid #bc13fe;
          z-index: 10;
          white-space: nowrap;
        }
        .speech-bubble::after {
          content: '';
          position: absolute;
          bottom: -18px;
          left: 55px;
          border-width: 18px 18px 0;
          border-style: solid;
          border-color: #ffffff transparent;
          display: block;
          width: 0;
        }

        .speech-bubble-small {
          position: absolute;
          top: -40px;
          right: -15px;
          background: #ffffff;
          color: #0f172a;
          padding: 16px 28px;
          border-radius: 28px;
          font-size: 30px;
          font-weight: 900;
          box-shadow: 0 10px 25px rgba(0,0,0,0.4);
          border: 3px solid #bc13fe;
          z-index: 10;
          white-space: nowrap;
        }
        .speech-bubble-small::after {
          content: '';
          position: absolute;
          bottom: -14px;
          left: 45px;
          border-width: 14px 14px 0;
          border-style: solid;
          border-color: #ffffff transparent;
          display: block;
          width: 0;
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
