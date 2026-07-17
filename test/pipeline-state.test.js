const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadPipelineState, recordPipelineEvent } = require('../src/pipeline-state');

test('persists failure reasons and recovery attempts for the next workflow run', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'today-econ-state-'));
  const filePath = path.join(directory, 'pipeline-state.json');
  recordPipelineEvent({
    status: 'failed',
    stage: 'content_generate',
    articleTitle: '노란우산 한도 확대',
    recoveryMode: true,
    repairAttempts: 2,
    qualityScore: 85,
    error: 'cover and first two cards do not connect the story to reader money',
  }, filePath);
  const state = loadPipelineState(filePath);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].stage, 'content_generate');
  assert.equal(state.events[0].recoveryMode, true);
  assert.equal(state.events[0].qualityScore, 85);
});
