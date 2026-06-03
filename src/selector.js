const fs = require('fs');
const Groq = require('groq-sdk');
const config = require('../config');

// Initialize Groq client
const groq = new Groq({
  apiKey: config.groqApiKey,
});

/**
 * Loads history of published news.
 * @returns {Array<{date: string, title: string}>}
 */
function loadHistory() {
  try {
    if (fs.existsSync(config.historyFile)) {
      const data = fs.readFileSync(config.historyFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[Selector] Failed to load history:', error);
  }
  return [];
}

/**
 * Saves a new entry to the history and cleans up old entries.
 * @param {string} title The title of the news that was just published.
 */
function saveHistoryEntry(title) {
  try {
    let history = loadHistory();
    
    // Add new entry
    history.push({
      date: new Date().toISOString().split('T')[0],
      title: title.trim(),
    });

    // Remove old entries (older than config.maxHistoryDays)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.maxHistoryDays);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    history = history.filter(entry => entry.date >= cutoffStr);

    fs.writeFileSync(config.historyFile, JSON.stringify(history, null, 2), 'utf8');
    console.log('[Selector] History updated successfully.');
  } catch (error) {
    console.error('[Selector] Failed to save history:', error);
  }
}

/**
 * Selects the single most important, non-duplicate news item.
 * @param {Array<{title: string, link: string, pubDate: string, summary: string}>} newsList 
 * @returns {Promise<{title: string, link: string, pubDate: string, summary: string}>}
 */
async function selectNews(newsList) {
  if (!newsList || newsList.length === 0) {
    throw new Error('[Selector] News list is empty. Nothing to select.');
  }

  const history = loadHistory();
  console.log(`[Selector] Loaded ${history.length} historical entries for duplicate checking.`);

  // If history is empty, we just let Llama pick the most important one without duplicate constraints.
  const historyListText = history.length > 0 
    ? history.map((h, i) => `${i + 1}. [${h.date}] ${h.title}`).join('\n')
    : '최근 다룬 뉴스 없음';

  const todayNewsText = newsList.map((item, index) => {
    return `[기사 인덱스 ${index}]
제목: ${item.title}
요약: ${item.summary}
---`;
  }).join('\n\n');

  const systemPrompt = `당신은 대한민국 최고의 경제 뉴스 큐레이터이자 인스타그램 마케터입니다.
오늘 수집된 뉴스 목록을 보고, 최근 다룬 뉴스들과 중복되거나 너무 유사한 주제(예: 매일 조금씩 변하는 코스피 수치, 환율의 미세한 변동 등 매일 반복되는 시황)는 철저히 배제하고, 독자들이 흥미를 가질 만한 '오늘 가장 중요하고 실생활에 파급력이 큰 경제 뉴스' 1개를 선정해야 합니다.

다음 규칙을 준수하세요:
1. 최근 다룬 뉴스 목록에 있는 주제와 겹치거나 매우 유사한 뉴스는 제외하세요.
2. 기사의 파급성, 실생활 연관성, 교육성(어려운 단어를 설명하기 좋은 뉴스)을 최우선으로 고려하세요.
3. 결과를 정확히 JSON 포맷으로만 응답해야 합니다. 다른 사족이나 마크다운 백틱없이 순수한 JSON 객체여야 합니다.

응답 JSON 형식:
{
  "selected_index": <선정한 기사의 인덱스 숫자>,
  "reason": "해당 기사를 선정한 이유 (한국어)"
}`;

  const userPrompt = `### 최근 7일 동안 이미 인스타그램에 업로드한 뉴스 목록:
${historyListText}

### 오늘 수집된 뉴스 목록:
${todayNewsText}

위의 오늘 수집된 뉴스 목록 중에서 최근에 업로드한 주제와 겹치지 않고 가장 가치 있는 기사 1개를 선택하여 JSON 형식으로 알려주세요.`;

  try {
    console.log('[Selector] Invoking Groq Llama to select news...');
    let resultText = '';
    
    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1, // 낮춤으로써 일관된 선택 보장
      });
      resultText = response.choices[0].message.content.trim();
    } catch (apiError) {
      // Fallback for 429 Rate Limits on Free Tier
      if (apiError.status === 429 || (apiError.message && apiError.message.includes('rate_limit'))) {
        console.warn('[Selector] 429 Rate limit hit on 70B model. Falling back to Llama 3.1 8B...');
        const response = await groq.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        });
        resultText = response.choices[0].message.content.trim();
      } else {
        throw apiError;
      }
    }

    console.log('[Selector] Received response from Groq:', resultText);
    const resultJson = JSON.parse(resultText);
    const selectedIndex = parseInt(resultJson.selected_index, 10);
    
    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= newsList.length) {
      console.warn('[Selector] Selected index is out of bounds or invalid. Defaulting to index 0.');
      return newsList[0];
    }

    const selectedNews = newsList[selectedIndex];
    console.log(`[Selector] Selected: "${selectedNews.title}" (Reason: ${resultJson.reason})`);
    return selectedNews;
  } catch (error) {
    console.error('[Selector] Error during news selection. Falling back to the first news item.', error);
    return newsList[0];
  }
}

module.exports = {
  selectNews,
  saveHistoryEntry,
};
