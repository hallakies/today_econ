const fs = require('fs');
const Groq = require('groq-sdk');
const config = require('../config');

// Initialize Groq client
const groq = new Groq({
  apiKey: config.groqApiKey,
});

/**
 * Helper to call Groq API with retries on 429 rate limit errors.
 */
async function callGroqWithRetry(params, retries = 5, delayMs = 8000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await groq.chat.completions.create(params);
    } catch (error) {
      const is429 = error.status === 429 || (error.message && error.message.toLowerCase().includes('rate'));
      if (is429 && i < retries - 1) {
        console.warn(`[Groq API] Hit rate limit (429). Retrying in ${delayMs}ms... (Attempt ${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2.0; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
}


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
  
  // Limit news selection to top 7 items to prevent rate limits (TPM)
  const slicedNewsList = newsList.slice(0, 7);

  // If history is empty, we just let Llama pick the most important one without duplicate constraints.
  const historyListText = history.length > 0 
    ? history.map((h, i) => `${i + 1}. [${h.date}] ${h.title}`).join('\n')
    : '최근 다룬 뉴스 없음';

  const todayNewsText = slicedNewsList.map((item, index) => {
    return `[기사 인덱스 ${index}]
제목: ${item.title}
요약: ${item.summary}
---`;
  }).join('\n\n');

  const systemPrompt = `당신은 대한민국 최고의 경제 뉴스 큐레이터이자 인스타그램 마케터입니다.
오늘 수집된 뉴스 목록을 보고, 최근 다룬 뉴스들과 중복되거나 너무 유사한 주제(예: 매일 조금씩 변하는 코스피 수치, 환율의 미세한 변동 등 매일 반복되는 시황)는 철저히 배제하고, 독자들이 흥미를 가질 만한 '오늘 가장 중요하고 실생활에 파급력이 큰 경제 뉴스' 1개를 선정해야 합니다.

다음 규칙을 준수하세요:
1. 최근 다룬 뉴스 목록에 있는 주제와 겹치거나 매우 유사한 뉴스는 제외하세요.
2. 기사의 파급성, 특히 **20~30대 직장인과 재테크 초보의 지갑(금리, 환율, 부동산, 물가, 세금 등 실생활)**에 직접적인 영향을 주는 뉴스를 최우선으로 고려하세요. 거시적/행정적/기업전용 뉴스는 후순위로 미루세요.
3. 결과를 정확히 JSON 포맷으로 응답해야 합니다.

응답 JSON 형식:
\`\`\`json
{
  "selected_index": <선정한 기사의 인덱스 숫자>,
  "reason": "해당 기사를 선정한 이유 (한국어)"
}
\`\`\``;

  const userPrompt = `### 최근 7일 동안 이미 인스타그램에 업로드한 뉴스 목록:
${historyListText}

### 오늘 수집된 뉴스 목록:
${todayNewsText}

위의 오늘 수집된 뉴스 목록 중에서 최근에 업로드한 주제와 겹치지 않고 가장 가치 있는 기사 1개를 선택하여 JSON 형식으로 알려주세요.`;

  try {
    console.log('[Selector] Invoking Groq Llama to select news...');
    let resultText = '';
    
    try {
      const response = await callGroqWithRetry({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: systemPrompt.normalize('NFC') },
          { role: 'user', content: userPrompt.normalize('NFC') }
        ],
        temperature: 0.1,
        max_tokens: 1000,
      });
      resultText = (response.choices[0]?.message?.content || '').trim();
      console.log('[Selector] Main model response length:', resultText.length);
      if (!resultText) throw new Error("Main model returned empty content");
    } catch (apiError) {
      console.warn('[Selector] 70B/120B failed or returned empty. Error:', apiError.message || apiError);
      console.warn('[Selector] Falling back to Llama 3.3 70B...');
      const response = await callGroqWithRetry({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt.normalize('NFC') },
          { role: 'user', content: userPrompt.normalize('NFC') }
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }, 3, 3000);
      resultText = (response.choices[0]?.message?.content || '').trim();
      console.log('[Selector] Fallback model response length:', resultText.length);
      if (!resultText) {
         console.warn('[Selector] Fallback model also returned empty content.');
      }
    }

    // Strip markdown code block wrapper if present
    let jsonText = resultText;
    const jsonBlockMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonBlockMatch) {
      jsonText = jsonBlockMatch[1].trim();
    }
    // Extract json object explicitly
    if (!jsonText.startsWith('{')) {
      const firstBrace = jsonText.indexOf('{');
      if (firstBrace >= 0) jsonText = jsonText.substring(firstBrace);
    }
    
    let resultJson;
    try {
      resultJson = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[Selector] JSON parse failed, returning fallback. Text was:', resultText);
      return newsList[0];
    }
    const selectedIndex = parseInt(resultJson.selected_index, 10);
    
    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= slicedNewsList.length) {
      console.warn('[Selector] Selected index is out of bounds or invalid. Defaulting to index 0.');
      return slicedNewsList[0];
    }

    const selectedNews = slicedNewsList[selectedIndex];
    console.log(`[Selector] Selected: "${selectedNews.title}" (Reason: ${resultJson.reason})`);
    return selectedNews;
  } catch (error) {
    console.error('[Selector] Error during news selection. Falling back to the first news item.', error);
    return slicedNewsList[0];
  }
}

module.exports = {
  selectNews,
  saveHistoryEntry,
};
