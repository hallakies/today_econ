const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSlideTimingPlan, buildVideoFilters, createReelVideo, estimateSlideDuration, resolveSlideDurations } = require('../src/reel');
const { createEditorialBackdrop } = require('../src/renderer');

test('builds a 9:16 blurred-background filter for every card', () => {
  const filter = buildVideoFilters(4);
  assert.match(filter, /scale=1080:1920/);
  assert.match(filter, /boxblur=18:2/);
  assert.match(filter, /concat=n=4:v=1:a=0/);
  assert.match(filter, /\[v0\].*\[v3\]/);
});

test('creates a Reel command with dynamic durations and a looped audio track', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'today-econ-reel-'));
  const images = [1, 2, 3, 4].map(index => {
    const file = path.join(directory, `slide_${index}.png`);
    fs.writeFileSync(file, Buffer.from('png'));
    return file;
  });
  const calls = [];
  const execFileImpl = async (command, args) => {
    calls.push({ command, args });
    return { stdout: '', stderr: '' };
  };

  await createReelVideo({
    imagePaths: images,
    outputPath: path.join(directory, 'reel.mp4'),
    slideDurations: [6, 7, 8, 9],
    execFileImpl,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, 'ffmpeg');
  const audioFilter = calls[0].args.find(value => String(value).includes('amix=inputs=3'));
  assert.match(audioFilter, /amix=inputs=3/);
  assert.match(audioFilter, /afade=t=out:st=29/);
  assert.ok(calls[1].args.includes('-map'));
  assert.ok(calls[1].args.includes('4:a:0'));
  assert.ok(calls[1].args.includes('-stream_loop'));
  assert.ok(calls[1].args.includes('30'));
  assert.equal(calls[1].args.at(-1), path.join(directory, 'reel.mp4'));
});

test('uses role-aware reading ranges for a three-slide editorial', () => {
  const plan = buildSlideTimingPlan({
    card1: { title: '청약통장 10만 명 해지', subtitle: '내 청약 계획을 다시 볼 때예요' },
    card2: { bullets: ['핵심 사실과 이유를 충분한 길이로 설명하는 문장입니다.'.repeat(3)] },
    card3: { bullets: ['내 돈에 미치는 영향과 오늘 확인할 행동을 충분히 설명합니다.'.repeat(4)] },
  }, 3);
  assert.deepEqual(plan.map(item => item.role), ['cover', 'fact', 'action']);
  assert.ok(plan[0].duration >= 4 && plan[0].duration <= 4.5);
  assert.ok(plan[1].duration >= 7 && plan[1].duration <= 9);
  assert.ok(plan[2].duration >= 9 && plan[2].duration <= 11);
  assert.ok(plan[2].duration > plan[0].duration);
});

test('gives dense slides more time inside the selected role range', () => {
  assert.equal(estimateSlideDuration('짧은 표지', { role: 'cover' }), 4);
  const dense = estimateSlideDuration('긴 설명입니다. '.repeat(20), { role: 'action' });
  assert.equal(dense, 11);
  const resolved = resolveSlideDurations(['짧은 표지', '상세한 본문 '.repeat(20)], 0, ['cover', 'fact']);
  assert.equal(resolved[0], 4);
  assert.ok(resolved[1] > 8 && resolved[1] <= 9);
  assert.deepEqual(resolveSlideDurations(['a', 'b', 'c'], 8), [8, 8, 8]);
});

test('uses a deterministic financial background without an unrelated portrait', () => {
  const backdrop = Buffer.from(createEditorialBackdrop('credit', '#D7A84B').split(',')[1], 'base64').toString('utf8');
  assert.match(backdrop, /path|rect/i);
  assert.doesNotMatch(backdrop, /person|portrait|face|woman|man/i);
});
