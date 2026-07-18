const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildVideoFilters, createReelVideo, estimateSlideDuration, resolveSlideDurations } = require('../src/reel');
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

test('gives dense slides more reading time while staying within 6-12 seconds', () => {
  assert.equal(estimateSlideDuration('짧은 표지'), 6);
  const dense = estimateSlideDuration('긴 설명입니다. '.repeat(20));
  assert.equal(dense, 12);
  assert.deepEqual(resolveSlideDurations(['짧은 표지', '상세한 본문 '.repeat(10)], 0), [6, 10]);
  assert.deepEqual(resolveSlideDurations(['a', 'b', 'c'], 8), [8, 8, 8]);
});

test('uses a deterministic financial background without an unrelated portrait', () => {
  const backdrop = Buffer.from(createEditorialBackdrop('credit', '#D7A84B').split(',')[1], 'base64').toString('utf8');
  assert.match(backdrop, /path|rect/i);
  assert.doesNotMatch(backdrop, /person|portrait|face|woman|man/i);
});
