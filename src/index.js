const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../config');
const { fetchNews, fetchArticleBody } = require('./crawler');
const { selectNews, saveHistoryEntry } = require('./selector');
const { generateCardContent } = require('./generator');
const { renderCardImages } = require('./renderer');
const { sendPipelineFailure, sendToSlack } = require('./slack');
const { cleanupExpiredReleases, createTemporaryRelease, deleteTemporaryRelease } = require('./github-assets');
const { createReelVideo } = require('./reel');
const { publishCarousel, publishReel, publishStory } = require('./instagram');
const { addPublishedPost } = require('./post-store');
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

async function publishToInstagram(renderedFiles, cardContent, selectedNews, instagramToken) {
  const removed = await cleanupExpiredReleases({
    token: config.githubToken,
    repository: config.githubRepository,
    maxAgeHours: 72,
  }).catch(error => {
    console.warn(`[Main] Temporary release cleanup will be retried later: ${error.message}`);
    return [];
  });
  if (removed.length) console.log(`[Main] Removed ${removed.length} expired asset releases.`);

  let reelPath = null;
  let requestedFormat = String(config.instagramFormat || 'reel').toLowerCase();
  if (!['reel', 'carousel'].includes(requestedFormat)) requestedFormat = 'reel';
  if (requestedFormat === 'reel') {
    reelPath = path.join(os.tmpdir(), `today-econ-${config.githubRunId || Date.now()}.mp4`);
    try {
      reelPath = await createReelVideo({
        imagePaths: renderedFiles,
        outputPath: reelPath,
        audioPath: config.instagramAudioFile || undefined,
        durationPerSlide: config.reelDurationPerSlide,
      });
      console.log(`[Main] Reel video created: ${reelPath}`);
    } catch (error) {
      if (!config.instagramAllowCarouselFallback) throw error;
      console.warn(`[Main] Reel creation failed; using carousel fallback: ${error.message}`);
      reelPath = null;
      requestedFormat = 'carousel';
    }
  }

  const assetPaths = renderedFiles.map((filePath, index) => ({
    path: filePath,
    filename: `slide_${index + 1}.png`,
    contentType: 'image/png',
  }));
  if (reelPath) assetPaths.push({ path: reelPath, filename: 'today-econ-reel.mp4', contentType: 'video/mp4' });
  let temporaryRelease;
  try {
    temporaryRelease = await createTemporaryRelease({
      assetPaths,
      token: config.githubToken,
      repository: config.githubRepository,
      runId: config.githubRunId || Date.now().toString(),
      targetCommitish: config.githubSha,
    });
  } catch (error) {
    error.temporaryFiles = reelPath ? [reelPath] : [];
    throw error;
  }

  try {
    let publication;
    let publishedFormat = requestedFormat;
    let fallbackReason = '';
    if (requestedFormat === 'reel' && temporaryRelease.videoUrl) {
      try {
        publication = await publishReel({
          videoUrl: temporaryRelease.videoUrl,
          caption: cardContent.instagram_caption,
          userId: config.instagramUserId,
          token: instagramToken,
          version: config.instagramApiVersion,
        });
      } catch (error) {
        if (!config.instagramAllowCarouselFallback) throw error;
        fallbackReason = error.message;
        publishedFormat = 'carousel';
        console.warn(`[Main] Reel publish failed; using carousel fallback: ${error.message}`);
        publication = await publishCarousel({
          imageUrls: temporaryRelease.imageUrls,
          caption: cardContent.instagram_caption,
          userId: config.instagramUserId,
          token: instagramToken,
          version: config.instagramApiVersion,
        });
      }
    } else {
      publication = await publishCarousel({
        imageUrls: temporaryRelease.imageUrls,
        caption: cardContent.instagram_caption,
        userId: config.instagramUserId,
        token: instagramToken,
        version: config.instagramApiVersion,
      });
    }
    const publicationWithFormat = { ...publication, format: publishedFormat };
    let storyPublication = null;
    let storyError = null;
    if (config.publishInstagramStory) {
      try {
        storyPublication = await publishStory({
          videoUrl: temporaryRelease.videoUrl,
          imageUrl: temporaryRelease.imageUrls[0],
          userId: config.instagramUserId,
          token: instagramToken,
          version: config.instagramApiVersion,
        });
        console.log(`[Main] Instagram Story published: ${storyPublication.permalink || storyPublication.id}`);
      } catch (error) {
        storyError = error.message;
        console.warn(`[Main] Instagram Story publish failed; Reel/Carousel remains published: ${error.message}`);
      }
    }
    addPublishedPost({
      mediaId: publicationWithFormat.id,
      permalink: publicationWithFormat.permalink,
      publishedAt: publicationWithFormat.timestamp || new Date().toISOString(),
      articleTitle: selectedNews.title,
      articleUrl: selectedNews.link,
      contentMetadata: cardContent.content_metadata,
      qualityScore: cardContent.quality_score,
      format: publishedFormat,
      requestedFormat: config.instagramFormat,
      fallbackReason: fallbackReason || undefined,
      story: storyPublication
        ? {
          id: storyPublication.id,
          permalink: storyPublication.permalink,
          publishedAt: storyPublication.timestamp || new Date().toISOString(),
          format: 'standalone_story_copy',
        }
        : (config.publishInstagramStory ? { status: 'failed', error: storyError } : { status: 'disabled' }),
      release: {
        id: temporaryRelease.releaseId,
        tag: temporaryRelease.tag,
        deleteAfter: new Date(Date.now() + 72 * 3600000).toISOString(),
      },
    });
    return {
      publication: publicationWithFormat,
      storyPublication,
      storyError,
      temporaryRelease,
      temporaryFiles: reelPath ? [reelPath] : [],
      format: publishedFormat,
    };
  } catch (error) {
    error.temporaryRelease = temporaryRelease;
    error.temporaryFiles = reelPath ? [reelPath] : [];
    throw error;
  }
}

async function run() {
  validateConfig();
  console.log(`[Main] Starting pipeline. Instagram publishing: ${config.publishInstagram ? 'enabled' : 'disabled'}`);
  let renderedFiles = [];
  let selectedNews = {};
  let temporaryRelease = null;
  let publication = null;
  let storyPublication = null;
  let storyError = null;
  let temporaryFiles = [];
  let stage = 'news_fetch';
  const recoveryMode = process.env.PIPELINE_RECOVERY_MODE === 'true';

  try {
    const newsList = await fetchNews(config.newsRssUrl);
    if (newsList.length === 0) throw new Error('[Main] No news articles found.');

    stage = 'news_select';
    selectedNews = await selectNews(newsList);
    console.log(`[Main] Selected news: ${selectedNews.title}`);
    stage = 'article_fetch';
    selectedNews.fullText = await fetchArticleBody(selectedNews.link) || selectedNews.summary;

    await new Promise(resolve => setTimeout(resolve, 8000));
    stage = 'content_generate';
    const cardContent = await generateCardContent(selectedNews);
    const backgroundUrl = cardContent.image_prompt
      ? `https://image.pollinations.ai/prompt/${encodeURIComponent(cardContent.image_prompt)}?width=1080&height=1350&nologo=true`
      : null;
    stage = 'render';
    renderedFiles = await renderCardImages(cardContent, backgroundUrl);

    if (config.publishInstagram) {
      try {
        stage = 'instagram_publish';
        const result = await publishToInstagram(renderedFiles, cardContent, selectedNews, resolveInstagramToken());
        publication = result.publication;
        storyPublication = result.storyPublication;
        storyError = result.storyError;
        temporaryRelease = result.temporaryRelease;
        temporaryFiles = result.temporaryFiles || [];
        saveHistoryEntry(selectedNews.title);
        console.log(`[Main] Instagram post published: ${publication.permalink}`);
      } catch (publishError) {
        temporaryRelease = publishError.temporaryRelease || null;
        temporaryFiles = publishError.temporaryFiles || [];
        await sendToSlack(renderedFiles, cardContent.instagram_caption, selectedNews, null).catch(() => {});
        throw publishError;
      }
    }

    stage = 'slack_notify';
    await sendToSlack(renderedFiles, cardContent.instagram_caption, selectedNews, publication, { storyPublication, storyError });
    recordPipelineEvent({
      status: publication ? 'published' : 'slack_only',
      stage,
      articleTitle: selectedNews.title,
      recoveryMode,
      qualityScore: cardContent.quality_score,
    });
    console.log('[Main] Pipeline completed successfully.');
    return { publication, temporaryRelease };
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
    if (temporaryRelease && !publication) {
      await deleteTemporaryRelease({
        releaseId: temporaryRelease.releaseId,
        tag: temporaryRelease.tag,
        token: config.githubToken,
        repository: config.githubRepository,
      }).catch(cleanupError => console.warn(`[Main] Release cleanup failed: ${cleanupError.message}`));
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
