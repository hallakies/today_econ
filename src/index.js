const fs = require('fs');
const config = require('../config');
const { fetchNews, fetchArticleBody } = require('./crawler');
const { selectNews, saveHistoryEntry } = require('./selector');
const { generateCardContent } = require('./generator');
const { renderCardImages } = require('./renderer');
const { sendPipelineFailure, sendToSlack } = require('./slack');
const { cleanupExpiredReleases, createTemporaryRelease, deleteTemporaryRelease } = require('./github-assets');
const { publishCarousel } = require('./instagram');
const { addPublishedPost } = require('./post-store');
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

  const temporaryRelease = await createTemporaryRelease({
    imagePaths: renderedFiles,
    token: config.githubToken,
    repository: config.githubRepository,
    runId: config.githubRunId || Date.now().toString(),
    targetCommitish: config.githubSha,
  });

  try {
    const publication = await publishCarousel({
      imageUrls: temporaryRelease.imageUrls,
      caption: cardContent.instagram_caption,
      userId: config.instagramUserId,
      token: instagramToken,
      version: config.instagramApiVersion,
    });
    addPublishedPost({
      mediaId: publication.id,
      permalink: publication.permalink,
      publishedAt: publication.timestamp || new Date().toISOString(),
      articleTitle: selectedNews.title,
      articleUrl: selectedNews.link,
      contentMetadata: cardContent.content_metadata,
      qualityScore: cardContent.quality_score,
      release: {
        id: temporaryRelease.releaseId,
        tag: temporaryRelease.tag,
        deleteAfter: new Date(Date.now() + 72 * 3600000).toISOString(),
      },
    });
    return { publication, temporaryRelease };
  } catch (error) {
    error.temporaryRelease = temporaryRelease;
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

  try {
    const newsList = await fetchNews(config.newsRssUrl);
    if (newsList.length === 0) throw new Error('[Main] No news articles found.');

    selectedNews = await selectNews(newsList);
    console.log(`[Main] Selected news: ${selectedNews.title}`);
    selectedNews.fullText = await fetchArticleBody(selectedNews.link) || selectedNews.summary;

    await new Promise(resolve => setTimeout(resolve, 8000));
    const cardContent = await generateCardContent(selectedNews);
    const backgroundUrl = cardContent.image_prompt
      ? `https://image.pollinations.ai/prompt/${encodeURIComponent(cardContent.image_prompt)}?width=1080&height=1350&nologo=true`
      : null;
    renderedFiles = await renderCardImages(cardContent, backgroundUrl);

    if (config.publishInstagram) {
      try {
        const result = await publishToInstagram(renderedFiles, cardContent, selectedNews, resolveInstagramToken());
        publication = result.publication;
        temporaryRelease = result.temporaryRelease;
        saveHistoryEntry(selectedNews.title);
        console.log(`[Main] Instagram post published: ${publication.permalink}`);
      } catch (publishError) {
        temporaryRelease = publishError.temporaryRelease || null;
        await sendToSlack(renderedFiles, cardContent.instagram_caption, selectedNews, null).catch(() => {});
        throw publishError;
      }
    }

    await sendToSlack(renderedFiles, cardContent.instagram_caption, selectedNews, publication);
    console.log('[Main] Pipeline completed successfully.');
    return { publication, temporaryRelease };
  } catch (error) {
    console.error('[Main] Pipeline failed:', error);
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
    cleanupTempFiles(renderedFiles);
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
