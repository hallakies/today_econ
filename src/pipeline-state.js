const fs = require('fs');
const path = require('path');
const config = require('../config');

const MAX_EVENTS = 40;

function ensureStateFile(filePath = config.pipelineStateFile) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '{"events":[]}\n', 'utf8');
}

function loadPipelineState(filePath = config.pipelineStateFile) {
  ensureStateFile(filePath);
  try {
    const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { events: Array.isArray(state.events) ? state.events : [] };
  } catch {
    return { events: [] };
  }
}

function recordPipelineEvent(event, filePath = config.pipelineStateFile) {
  const state = loadPipelineState(filePath);
  const safeEvent = {
    at: new Date().toISOString(),
    status: event.status,
    stage: event.stage || '',
    articleTitle: event.articleTitle || '',
    recoveryMode: Boolean(event.recoveryMode),
    repairAttempts: Number.isInteger(event.repairAttempts) ? event.repairAttempts : 0,
    qualityScore: event.qualityScore ?? null,
    error: String(event.error || '').slice(0, 1200),
  };
  state.events = [...state.events, safeEvent].slice(-MAX_EVENTS);
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return safeEvent;
}

module.exports = { loadPipelineState, recordPipelineEvent };
