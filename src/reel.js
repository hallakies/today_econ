const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const DEFAULT_DURATION_SECONDS = 8;
const DEFAULT_AUDIO_SECONDS = 24;
const ROLE_DURATION_RANGES = Object.freeze({
  cover: [4, 4.5],
  fact: [7, 9],
  audience: [7, 9],
  action: [9, 11],
});

function estimateSlideDuration(text = '', { role = 'fact', minSeconds, maxSeconds } = {}) {
  const visibleLength = String(text)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '')
    .length;
  const [roleMinimum, roleMaximum] = ROLE_DURATION_RANGES[role] || ROLE_DURATION_RANGES.fact;
  const minimum = Number.isFinite(minSeconds) ? minSeconds : roleMinimum;
  const maximum = Number.isFinite(maxSeconds) ? maxSeconds : roleMaximum;
  const expectedMinimum = role === 'cover' ? 18 : 40;
  const expectedRange = role === 'cover' ? 55 : 100;
  const ratio = Math.max(0, Math.min(1, (visibleLength - expectedMinimum) / expectedRange));
  return Number((minimum + (maximum - minimum) * ratio).toFixed(1));
}

function resolveSlideDurations(slideTexts, override, roles = []) {
  const texts = Array.isArray(slideTexts) ? slideTexts : [];
  const fixed = Number(override);
  if (fixed > 0) return texts.map(() => fixed);
  return texts.map((text, index) => estimateSlideDuration(text, { role: roles[index] || 'fact' }));
}

function buildSlideTimingPlan(cardContent = {}, slideCount = 3, override) {
  const hasActionCard = Boolean(cardContent.card4);
  const roles = hasActionCard
    ? ['cover', 'fact', 'audience', 'action']
    : ['cover', 'fact', 'action'];
  const cards = hasActionCard
    ? [cardContent.card1, cardContent.card2, cardContent.card3, cardContent.card4]
    : [cardContent.card1, cardContent.card2, cardContent.card3];
  const slideTexts = Array.from({ length: slideCount }, (_, index) => {
    const card = cards[index] || {};
    return Object.values(card).flat(Infinity).join(' ');
  });
  const activeRoles = roles.slice(0, slideCount);
  const durations = resolveSlideDurations(slideTexts, override, activeRoles);
  return durations.map((duration, index) => ({ role: activeRoles[index] || 'fact', duration }));
}

function resolveFfmpegPath() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

async function runFfmpeg(args, { execFileImpl = execFileAsync, ffmpegPath = resolveFfmpegPath() } = {}) {
  try {
    return await execFileImpl(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 8 });
  } catch (error) {
    const details = error.stderr || error.stdout || error.message;
    throw new Error(`[Reel] ffmpeg failed: ${String(details).trim()}`);
  }
}

async function createAmbientAudio({ outputPath = path.join(os.tmpdir(), `today-econ-bed-${Date.now()}.m4a`), durationSeconds = DEFAULT_AUDIO_SECONDS, execFileImpl } = {}) {
  // Original, low-volume three-note bed. It is generated locally so no third-party
  // recording or Instagram music-library permission is required.
  const duration = Number(durationSeconds) > 0 ? Number(durationSeconds) : DEFAULT_AUDIO_SECONDS;
  await runFfmpeg([
    '-y',
    '-f', 'lavfi', '-i', `sine=frequency=220:duration=${duration}`,
    '-f', 'lavfi', '-i', `sine=frequency=277.18:duration=${duration}`,
    '-f', 'lavfi', '-i', `sine=frequency=329.63:duration=${duration}`,
    '-filter_complex', '[0:a][1:a][2:a]amix=inputs=3:duration=longest,volume=0.10,afade=t=in:st=0:d=0.8,afade=t=out:st=' + Math.max(0, duration - 1) + ':d=1',
    '-c:a', 'aac', '-b:a', '96k', outputPath,
  ], { execFileImpl });
  return outputPath;
}

function buildVideoFilters(imageCount) {
  const filters = [];
  for (let index = 0; index < imageCount; index += 1) {
    filters.push(`[${index}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=18:2[bg${index}]`);
    filters.push(`[${index}:v]scale=1080:1350:force_original_aspect_ratio=decrease[fg${index}]`);
    filters.push(`[bg${index}][fg${index}]overlay=0:(H-h)/2,setsar=1[v${index}]`);
  }
  filters.push(`${Array.from({ length: imageCount }, (_, index) => `[v${index}]`).join('')}concat=n=${imageCount}:v=1:a=0[v]`);
  return filters.join(';');
}

async function createReelVideo({
  imagePaths,
  outputPath = path.join(os.tmpdir(), `today-econ-reel-${Date.now()}.mp4`),
  audioPath,
  durationPerSlide,
  slideTexts,
  slideDurations,
  execFileImpl,
} = {}) {
  if (!Array.isArray(imagePaths) || imagePaths.length < 2) {
    throw new Error('[Reel] At least two card images are required.');
  }
  imagePaths.forEach(imagePath => {
    if (!fs.existsSync(imagePath)) throw new Error(`[Reel] Image not found: ${imagePath}`);
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const durations = Array.isArray(slideDurations) && slideDurations.length === imagePaths.length
    ? slideDurations.map(value => Math.max(1, Number(value) || DEFAULT_DURATION_SECONDS))
    : resolveSlideDurations(
      Array.isArray(slideTexts) && slideTexts.length === imagePaths.length ? slideTexts : imagePaths.map(() => ''),
      durationPerSlide
    );
  const totalDuration = durations.reduce((sum, value) => sum + value, 0);
  let resolvedAudio = audioPath;
  let generatedAudio = false;
  if (!resolvedAudio || !fs.existsSync(resolvedAudio)) {
    resolvedAudio = path.join(os.tmpdir(), `today-econ-bed-${Date.now()}.m4a`);
    await createAmbientAudio({ outputPath: resolvedAudio, durationSeconds: totalDuration, execFileImpl });
    generatedAudio = true;
  }

  const args = ['-y'];
  imagePaths.forEach((imagePath, index) => args.push('-loop', '1', '-t', String(durations[index]), '-i', imagePath));
  args.push('-stream_loop', '-1', '-i', resolvedAudio);
  args.push(
    '-filter_complex', buildVideoFilters(imagePaths.length),
    '-map', '[v]',
    '-map', `${imagePaths.length}:a:0`,
    '-t', String(totalDuration),
    '-r', '30',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '96k',
    '-movflags', '+faststart',
    outputPath,
  );

  try {
    await runFfmpeg(args, { execFileImpl });
  } finally {
    if (generatedAudio) {
      try { fs.unlinkSync(resolvedAudio); } catch { /* best effort */ }
    }
  }
  return outputPath;
}

module.exports = {
  DEFAULT_DURATION_SECONDS,
  ROLE_DURATION_RANGES,
  buildSlideTimingPlan,
  buildVideoFilters,
  createAmbientAudio,
  createReelVideo,
  estimateSlideDuration,
  resolveSlideDurations,
  runFfmpeg,
};
