const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../config');
const { fetchNews, fetchArticleBody } = require('./crawler');
const { rankNewsCandidates, selectNews, saveHistoryEntry } = require('./selector');
const { generateCardContent } = require('./generator');
const { renderCardImages } = require('./renderer');
const { sendPipelineFailure, sendToSlack } = require('./slack');
const { cleanupExpiredReleases, createTemporaryRelease, deleteTemporaryRelease } = require('./github-assets');
const { buildSlideTimingPlan, createReelVideo } = require('./reel');
const { publishCarousel, publishReel, publishStory } = require('./instagram');
const { findPublishedPost, upsertPublishedPost } = require('./post-store');
const { recordPipelineEvent } = require('./pipeline-state');
const { resolveInstagramToken } = require('./token-vault');

function validateConfig() {
  const missing = [];
  if (!config.groqApiKey) missing.push('GROQ_API_KEY');
  if (!config.slackBotToken) missing.push('SLACK_BOT_TOKEN');
  if (!config.slackChannelId) missing.push('SLACK_CHANNEL_ID');
  if (config.publishInstagram) {
    if (!config.instagramAccessToken && !(config.instagramTokenEncryptionKey && fs.existsSync(config.instagramTokenFile))) {
      missing.push('INSTAGRAM_ACCESS_TOKEN or encrypted token vault');
    }
    if (!config.instagramUserId) missing.push('INSTAGRAM_USER_ID');
    if (!config.githubToken) missing.push('GITHUB_TOKEN');
    if (!config.githubRepository) missing.push('GITHUB_REPOSITORY');
  }
  if (missing.length) throw new Error(`[Main] Missing required environment variables: ${missing.join(', ')}`);
}

function cleanupTempFiles(files) {
  for (const file of files) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (error) {
      console.warn(`[Main] Failed to delete ${file}: ${error.message}`);
    }
  }
}

function storedPublication(post) {
  if (!post) return null;
  return {
    id: post.mediaId,
    permalink: post.permalink,
    timestamp: post.publishedAt,
    format: post.format,
    story: post.story,
    reused: true,
  };
}

async function publishToInstagram(renderedFiles, cardContent, selectedNews, instagramToken, overrides = {}) {
  const dependencies = {
    cleanupExpiredReleases,
    createTemporaryRelease,
    createReelVideo,
    publishCarousel,
    publishReel,
    publishStory,
    findPublishedPost,
    upsertPublishedPost,
    ...overrides,
  };
  const existingReelPost = dependencies.findPublishedPost({ articleUrl: selectedNews.link, format: 'reel' });
  const existingCarouselPost = dependencies.findPublishedPost({ articleUrl: selectedNews.link, format: 'carousel' });
  const publications = {
    reel: storedPublication(existingReelPost),
    carousel: storedPublication(existingCarouselPost),
  };
  const formatErrors = {};
  let storyPublication = existingReelPost?.story?.id ? { ...existingReelPost.story, reused: true } : null;
  let storyError = null;
  const needsReel = !publications.reel;
  const needsCarousel = !publications.carousel;
  const needsStory = config.publishInstagramStory && !storyPublication;

  if (!needsReel && !needsCarousel && !needsStory) {
    console.log('[Main] Reel, Carousel, and Story already published for this article; skipping duplicate media creation.');
    return {
      publication: publications.reel,
      publications,
      storyPublication,
      storyError,
      temporaryRelease: null,
      temporaryFiles: [],
      format: 'reel+carousel',
      skipped: true,
    };
  }

  const removed = await dependencies.cleanupExpiredReleases({
    token: config.githubToken,
    repository: config.githubRepository,
    maxAgeHours: 72,
  }).catch(error => {
    console.warn(`[Main] Temporary release cleanup will be retried later: ${error.message}`);
    return [];
  });
  if (removed.length) console.log(`[Main] Removed ${removed.length} expired asset releases.`);

  let reelPath = null;
  if (needsReel || needsStory) {
    reelPath = path.join(os.tmpdir(), `today-econ-${config.githubRunId || Date.now()}.mp4`);
    const timingPlan = buildSlideTimingPlan(cardContent, renderedFiles.length, config.reelDurationPerSlide);
    try {
      reelPath = await dependencies.createReelVideo({
        imagePaths: renderedFiles,
        outputPath: reelPath,
        audioPath: config.instagramAudioFile || undefined,
        slideDurations: timingPlan.map(item => item.duration),
      });
      console.log(`[Main] Reel video created with role-aware timing (${timingPlan.map(item => `${item.role}:${item.duration}s`).join(', ')}): ${reelPath}`);
    } catch (error) {
      reelPath = null;
      formatErrors.reel = `video creation: ${error.message}`;
      console.warn(`[Main] Reel video creation failed; Carousel will still be attempted: ${error.message}`);
    }
  }

  const releases = { reel: null, carousel: null };
  const temporaryFiles = reelPath ? [reelPath] : [];
  if (reelPath) {
    try {
      releases.reel = await dependencies.createTemporaryRelease({
        assetPaths: [{ path: reelPath, filename: 'today-econ-reel.mp4', contentType: 'video/mp4' }],
        token: config.githubToken,
        repository: config.githubRepository,
        runId: `${config.githubRunId || Date.now().toString()}-reel`,
        targetCommitish: config.githubSha,
      });
    } catch (error) {
      formatErrors.reel = `video hosting: ${error.message}`;
      console.warn(`[Main] Reel asset hosting failed; Carousel will still be attempted: ${error.message}`);
    }
  }
  if (needsCarousel) {
    const carouselAssets = renderedFiles.map((filePath, index) => ({
      path: filePath,
      filename: `slide_${index + 1}.png`,
      contentType: 'image/png',
    }));
    try {
      releases.carousel = await dependencies.createTemporaryRelease({
        assetPaths: carouselAssets,
        token: config.githubToken,
        repository: config.githubRepository,
        runId: `${config.githubRunId || Date.now().toString()}-carousel`,
        targetCommitish: config.githubSha,
      });
    } catch (error) {
      formatErrors.carousel = `image hosting: ${error.message}`;
      console.warn(`[Main] Carousel asset hosting failed; any hosted Reel remains publishable: ${error.message}`);
    }
  }

  try {
    const commonRecord = format => ({
      articleTitle: selectedNews.title,
      articleUrl: selectedNews.link,
      contentMetadata: cardContent.content_metadata,
      qualityScore: cardContent.quality_score,
      requestedFormats: ['reel', 'carousel'],
      release: releases[format] ? {
        id: releases[format].releaseId,
        tag: releases[format].tag,
        deleteAfter: new Date(Date.now() + 72 * 3600000).toISOString(),
      } : undefined,
    });

    if (needsReel && releases.reel?.videoUrl && !formatErrors.reel) {
      try {
        const reel = await dependencies.publishReel({
          videoUrl: releases.reel.videoUrl,
          caption: cardContent.reel_caption || cardContent.instagram_caption,
          userId: config.instagramUserId,
          token: instagramToken,
          version: config.instagramApiVersion,
        });
        publications.reel = { ...reel, format: 'reel' };
        dependencies.upsertPublishedPost({
          ...commonRecord('reel'),
          mediaId: reel.id,
          permalink: reel.permalink,
          publishedAt: reel.timestamp || new Date().toISOString(),
          format: 'reel',
          story: config.publishInstagramStory ? { status: 'pending' } : { status: 'disabled' },
        });
        console.log(`[Main] Instagram Reel published: ${reel.permalink || reel.id}`);
      } catch (error) {
        formatErrors.reel = error.message;
        console.warn(`[Main] Instagram Reel failed; Carousel will still be attempted: ${error.message}`);
      }
    }

    if (needsCarousel && releases.carousel?.imageUrls?.length && !formatErrors.carousel) {
      try {
        const carousel = await dependencies.publishCarousel({
          imageUrls: releases.carousel.imageUrls,
          caption: cardContent.instagram_caption,
          userId: config.instagramUserId,
          token: instagramToken,
          version: config.instagramApiVersion,
        });
        publications.carousel = { ...carousel, format: 'carousel' };
        dependencies.upsertPublishedPost({
          ...commonRecord('carousel'),
          mediaId: carousel.id,
          permalink: carousel.permalink,
          publishedAt: carousel.timestamp || new Date().toISOString(),
          format: 'carousel',
        });
        console.log(`[Main] Instagram Carousel published: ${carousel.permalink || carousel.id}`);
      } catch (error) {
        formatErrors.carousel = error.message;
        console.warn(`[Main] Instagram Carousel failed; any successful Reel remains recorded: ${error.message}`);
      }
    }

    if (needsStory && publications.reel && releases.reel?.videoUrl) {
      try {
        storyPublication = await dependencies.publishStory({
          videoUrl: releases.reel.videoUrl,
          userId: config.instagramUserId,
          token: instagramToken,
          version: config.instagramApiVersion,
        });
        console.log(`[Main] Instagram Story published: ${storyPublication.permalink || storyPublication.id}`);
      } catch (error) {
        storyError = error.message;
        console.warn(`[Main] Instagram Story publish failed; Reel and Carousel results remain intact: ${error.message}`);
      }
      const reel = publications.reel;
      dependencies.upsertPublishedPost({
        ...commonRecord('reel'),
        mediaId: reel.id,
        permalink: reel.permalink,
        publishedAt: reel.timestamp || new Date().toISOString(),
        format: 'reel',
        story: storyPublication
          ? {
            id: storyPublication.id,
            permalink: storyPublication.permalink,
            publishedAt: storyPublication.timestamp || new Date().toISOString(),
            format: 'standalone_story_copy',
          }
          : { status: 'failed', error: storyError },
      });
    }

    const publication = publications.reel || publications.carousel;
    if (Object.keys(formatErrors).length > 0) {
      const error = new Error(`[Main] Instagram format publishing incomplete: ${Object.entries(formatErrors).map(([format, message]) => `${format}: ${message}`).join('; ')}`);
      error.publication = publication;
      error.publications = publications;
      error.formatErrors = formatErrors;
      error.storyPublication = storyPublication;
      error.storyError = storyError;
      error.temporaryRelease = releases.reel || releases.carousel;
      error.temporaryReleases = releases;
      error.temporaryFiles = temporaryFiles;
      throw error;
    }

    return {
      publication,
      publications,
      storyPublication,
      storyError,
      temporaryRelease: releases.reel || releases.carousel,
      temporaryReleases: releases,
      temporaryFiles,
      format: 'reel+carousel',
    };
  } catch (error) {
    error.temporaryRelease ||= releases.reel || releases.carousel;
    error.temporaryReleases ||= releases;
    error.temporaryFiles ||= temporaryFiles;
    throw error;
  }
}

async function run() {
  validateConfig();
  console.log(`[Main] Starting pipeline. Instagram publishing: ${config.publishInstagram ? 'enabled' : 'disabled'}`);
  let renderedFiles = [];
  let selectedNews = {};
  let temporaryRelease = null;
  let temporaryReleases = { reel: null, carousel: null };
  let publication = null;
  let publications = { reel: null, carousel: null };
  let storyPublication = null;
  let storyError = null;
  let temporaryFiles = [];
  let cardContent = null;
  let stage = 'news_fetch';
  const recoveryMode = process.env.PIPELINE_RECOVERY_MODE === 'true';

  try {
    const newsList = await fetchNews(config.newsRssUrl);
    if (newsList.length === 0) throw new Error('[Main] No news articles found.');

    stage = 'news_select';
    const preferredNews = await selectNews(newsList);
    const candidates = rankNewsCandidates(newsList.slice(0, 15), preferredNews).slice(0, 5);
    let lastCandidateError = null;
    for (let index = 0; index < candidates.length; index += 1) {
      selectedNews = candidates[index];
      console.log(`[Main] Trying news candidate ${index + 1}/${candidates.length}: ${selectedNews.title}`);
      try {
        stage = 'article_fetch';
        selectedNews.fullText = await fetchArticleBody(selectedNews.link) || selectedNews.summary;
        if (index === 0) await new Promise(resolve => setTimeout(resolve, 8000));
        stage = 'content_generate';
        cardContent = await generateCardContent(selectedNews);
        break;
      } catch (candidateError) {
        lastCandidateError = candidateError;
        recordPipelineEvent({
          status: 'article_rejected',
          stage,
          articleTitle: selectedNews.title,
          error: candidateError.message,
          qualityScore: candidateError.qualityReport?.score,
        });
        console.warn(`[Main] Candidate rejected; moving to the next ranked article: ${candidateError.message}`);
      }
    }
    if (!cardContent) throw lastCandidateError || new Error('[Main] No candidate produced a publishable editorial.');
    stage = 'render';
    renderedFiles = await renderCardImages(cardContent);

    if (config.publishInstagram) {
      try {
        stage = 'instagram_publish';
        const result = await publishToInstagram(renderedFiles, cardContent, selectedNews, resolveInstagramToken());
        publication = result.publication;
        publications = result.publications;
        storyPublication = result.storyPublication;
        storyError = result.storyError;
        temporaryRelease = result.temporaryRelease;
        temporaryReleases = result.temporaryReleases || temporaryReleases;
        temporaryFiles = result.temporaryFiles || [];
        saveHistoryEntry(selectedNews.title);
        console.log(`[Main] Instagram formats published: Reel=${publications.reel?.permalink || 'missing'}, Carousel=${publications.carousel?.permalink || 'missing'}`);
      } catch (publishError) {
        publication = publishError.publication || null;
        publications = publishError.publications || publications;
        storyPublication = publishError.storyPublication || null;
        storyError = publishError.storyError || null;
        temporaryRelease = publishError.temporaryRelease || null;
        temporaryReleases = publishError.temporaryReleases || temporaryReleases;
        temporaryFiles = publishError.temporaryFiles || [];
        await sendToSlack(renderedFiles, cardContent.instagram_caption, selectedNews, publication, {
          publications,
          storyPublication,
          storyError,
        }).catch(() => {});
        throw publishError;
      }
    }

    stage = 'slack_notify';
    await sendToSlack(renderedFiles, cardContent.instagram_caption, selectedNews, publication, {
      publications,
      storyPublication,
      storyError,
    });
    recordPipelineEvent({
      status: publication ? 'published' : 'slack_only',
      stage,
      articleTitle: selectedNews.title,
      recoveryMode,
      qualityScore: cardContent.quality_score,
    });
    console.log('[Main] Pipeline completed successfully.');
    return { publication, publications, temporaryRelease };
  } catch (error) {
    console.error('[Main] Pipeline failed:', error);
    recordPipelineEvent({
      status: 'failed',
      stage,
      articleTitle: selectedNews.title,
      recoveryMode,
      repairAttempts: error.repairAttempts,
      qualityScore: error.qualityReport?.score,
      error: error.message,
    });
    await sendPipelineFailure(error, selectedNews).catch(slackError => {
      console.warn(`[Main] Could not send failure alert: ${slackError.message}`);
    });
    if (!publication) {
      const releasesToDelete = [...new Set(Object.values(temporaryReleases).filter(Boolean))];
      if (releasesToDelete.length === 0 && temporaryRelease) releasesToDelete.push(temporaryRelease);
      for (const release of releasesToDelete) {
        await deleteTemporaryRelease({
          releaseId: release.releaseId,
          tag: release.tag,
          token: config.githubToken,
          repository: config.githubRepository,
        }).catch(cleanupError => console.warn(`[Main] Release cleanup failed: ${cleanupError.message}`));
      }
    }
    throw error;
  } finally {
    cleanupTempFiles([...renderedFiles, ...temporaryFiles]);
  }
}

if (require.main === module) {
  run().catch(() => {
    process.exitCode = 1;
  });
}

module.exports = {
  cleanupTempFiles,
  publishToInstagram,
  run,
  validateConfig,
};
