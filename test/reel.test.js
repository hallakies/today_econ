const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildVideoFilters, createReelVideo } = require('../src/reel');

test('builds a 9:16 blurred-background filter for every card', () => {
  const filter = buildVideoFilters(4);
  assert.match(filter, /scale=1080:1920/);
  assert.match(filter, /boxblur=18:2/);
  assert.match(filter, /concat=n=4:v=1:a=0/);
  assert.match(filter, /\[v0\].*\[v3\]/);
});

test('creates a Reel command with an embedded audio track', async () => {
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
    execFileImpl,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, 'ffmpeg');
  const audioFilter = calls[0].args.find(value => String(value).includes('amix=inputs=3'));
  assert.match(audioFilter, /amix=inputs=3/);
  assert.match(audioFilter, /afade=t=out:st=11/);
  assert.ok(calls[1].args.includes('-map'));
  assert.ok(calls[1].args.includes('4:a:0'));
  assert.equal(calls[1].args.at(-1), path.join(directory, 'reel.mp4'));
});
