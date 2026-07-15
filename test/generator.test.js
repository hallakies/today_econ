const test = require('node:test');
const assert = require('node:assert/strict');
const { finalizeCaption, parseJsonResponse } = require('../src/generator');

test('preserves useful caption paragraphs and replaces generated hashtags', () => {
  const caption = finalizeCaption('훅입니다.\n\n핵심 설명입니다.\n\n어떻게 보세요?\n\n#임시태그');
  assert.match(caption, /훅입니다\.\n\n핵심/);
  assert.doesNotMatch(caption, /임시태그/);
  assert.match(caption, /#today\.econ/);
});

test('parses JSON wrapped in a markdown fence', () => {
  assert.deepEqual(parseJsonResponse('```json\n{"ok":true}\n```'), { ok: true });
});
