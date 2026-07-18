const fs = require('fs');
const Groq = require('groq-sdk');
const config = require('../config');

function loadHistory() {
  try {
    if (fs.existsSync(config.historyFile)) {
      return JSON.parse(fs.readFileSync(config.historyFile, 'utf8'));
    }
  } catch (error) {
    console.error('[Selector] Failed to load history:', error.message);
  }
  return [];
}

function saveHistoryEntry(title) {
  const history = loadHistory();
  history.push({ date: new Date().toISOString().slice(0, 10), title: title.trim().normalize('NFC') });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.maxHistoryDays);
  const retained = history.filter(entry => entry.date >= cutoff.toISOString().slice(0, 10));
  fs.writeFileSync(config.historyFile, `${JSON.stringify(retained, null, 2)}\n`, 'utf8');
}

async function requestSelection(systemPrompt, userPrompt, model, maxTokens = 1200) {
  const groq = new Groq({ apiKey: config.groqApiKey });
  const response = await groq.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt.normalize('NFC') },
      { role: 'user', content: userPrompt.normalize('NFC') },
    ],
    temperature: 0.1,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  });
  return JSON.parse(response.choices[0]?.message?.content || '{}');
}

function buildFallbackRanking(newsList) {
  return newsList
    .map((item, index) => ({
      index,
      score: scoreCandidate(item, index),
    }))
    .sort((a, b) => b.score - a.score)[0]?.index || 0;
}

function scoreCandidate(item = {}, index = 0, now = new Date()) {
  const text = `${item.title || ''} ${item.summary || ''}`.normalize('NFC');
  const publishedAt = new Date(item.pubDate || '');
  const ageHours = Number.isNaN(publishedAt.getTime())
    ? null
    : Math.max(0, (now.getTime() - publishedAt.getTime()) / 3600000);
  const moneyImpact = /(주식|주가|금리|대출|주택|부동산|청약|세금|물가|환율|ETF|예금|적금|연금|소득|고용|코인)/i.test(text) ? 12 : 0;
  const saveableNumber = /\d[\d,.]*(?:%|퍼센트|원|조|억|만|명|배|년|월)/i.test(text) ? 8 : 0;
  const concreteChange = /(인상|인하|늘|줄|증가|감소|확대|축소|제한|시행|폐지|개편|급등|급락|두\s*배)/.test(text) ? 6 : 0;
  const readerDecision = /(상환|이자|한도|납입|해지|분양|매매|소득|가격|부담|혜택|연체)/.test(text) ? 5 : 0;
  const timely = ageHours === null ? 0 : ageHours <= 24 ? 5 : ageHours <= 72 ? 2 : -2;
  const lowValue = /(인사|선임|취임|업무협약|MOU|포토|화보|이벤트)/i.test(text) ? -20 : 0;
  return moneyImpact + saveableNumber + concreteChange + readerDecision + timely + lowValue + Math.max(0, 5 - index * 0.25);
}

function rankNewsCandidates(newsList, preferred) {
  return [...newsList]
    .map((item, index) => ({
      item,
      index,
      score: (item === preferred ? 100 : 0) + scoreCandidate(item, index),
    }))
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.item);
}

async function selectNews(newsList) {
  if (!Array.isArray(newsList) || newsList.length === 0) {
    throw new Error('[Selector] News list is empty.');
  }

  const candidates = newsList.slice(0, 15);
  const history = loadHistory();
  const systemPrompt = `당신은 오늘경제(@today.econ)의 뉴스 편집자입니다.
목표는 20~30대 직장인과 재테크 초보의 돈에 가장 큰 영향을 주는 기사 하나를 고르는 것입니다.
평가 기준은 각각 0~5점으로 채점하세요:
1. money_impact: 대출·주거·소득·세금·투자에 미치는 구체적 영향
2. actionability: 독자가 지금 확인할 것이 있는지
3. timeliness: 오늘 알아야 할 이유
4. saveability: 저장할 만한 숫자·비교·체크리스트로 바꿀 수 있는지
5. novelty: 최근 7일 주제와 다른지
단순 주가 등락, 기관 인사, MOU, 광고성 기사는 제외하세요.
투자 기사라도 종목 추천보다 독자의 의사결정을 돕는 기사를 우선하세요.
JSON만 응답하세요: {"selected_index":0,"scores":{"money_impact":0,"actionability":0,"timeliness":0,"saveability":0,"novelty":0},"reason":"선정 이유"}`;

  const historyText = history.length
    ? history.map(item => `[${item.date}] ${item.title}`).join('\n')
    : '최근 게시물 없음';
  const candidateText = candidates
    .map((item, index) => `[${index}] ${item.title}\n${item.summary}`)
    .join('\n\n');
  const userPrompt = `최근 7일 게시물:\n${historyText}\n\n후보 기사:\n${candidateText}`;

  try {
    let result;
    try {
      result = await requestSelection(systemPrompt, userPrompt, 'llama-3.3-70b-versatile');
    } catch (error) {
      console.warn(`[Selector] Main model failed: ${error.message}`);
      result = await requestSelection(systemPrompt, userPrompt, 'llama-3.1-8b-instant', 1000);
    }
    const selectedIndex = Number(result.selected_index);
    if (!Number.isInteger(selectedIndex) || !candidates[selectedIndex]) throw new Error('invalid selected_index');
    console.log(`[Selector] Selected "${candidates[selectedIndex].title}": ${result.reason}`);
    return candidates[selectedIndex];
  } catch (error) {
    const fallbackIndex = buildFallbackRanking(candidates);
    console.warn(`[Selector] Using deterministic fallback ${fallbackIndex}: ${error.message}`);
    return candidates[fallbackIndex];
  }
}

module.exports = {
  buildFallbackRanking,
  rankNewsCandidates,
  loadHistory,
  saveHistoryEntry,
  scoreCandidate,
  selectNews,
};
