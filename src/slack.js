const fs = require('fs');
const { WebClient } = require('@slack/web-api');
const config = require('../config');

// Initialize Slack WebClient
const web = new WebClient(config.slackBotToken);

/**
 * Uploads generated images and posts the Instagram caption to a Slack channel.
 * @param {Array<string>} imagePaths File paths of the 3 rendered PNG slides.
 * @param {object} selectedNews The original news item object containing title and link.
 */
async function sendToSlack(imagePaths, instagramCaption, selectedNews = {}, publication = null) {
  if (!config.slackBotToken || !config.slackChannelId) {
    throw new Error('[Slack] Missing SLACK_BOT_TOKEN or SLACK_CHANNEL_ID. Cannot send notification.');
  }

  console.log(`[Slack] Uploading ${imagePaths.length} slides to channel: ${config.slackChannelId}...`);

  // Map file paths to file uploads array required by filesUploadV2
  const fileUploads = imagePaths.map(filePath => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`[Slack] File not found at path: ${filePath}`);
    }
    return {
      file: fs.createReadStream(filePath),
      filename: filePath,
    };
  });

  // Extract body and hashtags from instagramCaption to insert the original news source link in between
  const hashtagsPattern = /\n\n#경제공부.*/s;
  let captionBody = instagramCaption;
  const hashtags = '\n\n#경제공부 #경제뉴스 #오늘의경제 #10초경제 #today.econ';
  
  if (hashtagsPattern.test(instagramCaption)) {
    captionBody = instagramCaption.replace(hashtagsPattern, '').trim();
  }

  const newsRef = selectedNews.link ? `\n\n🔗 원본 기사:\n<${selectedNews.link}|${selectedNews.title}>` : '';
  const publishRef = publication?.permalink
    ? `\n\n✅ Instagram 자동 게시 완료: <${publication.permalink}|게시물 열기>`
    : '\n\nℹ️ Instagram 자동 게시는 비활성화된 실행입니다.';
  const captionMessage = `${captionBody}${newsRef}${publishRef}${hashtags}`;

  try {
    // 1. Upload files first (without initial_comment to prevent duplicate posts in some slack APIs)
    console.log('[Slack] Sending files via filesUploadV2...');
    const uploadResponse = await web.filesUploadV2({
      channel_id: config.slackChannelId,
      file_uploads: fileUploads,
    });

    // 2. Post a single, dedicated chat message containing the copyable Instagram caption
    console.log('[Slack] Posting Instagram caption via chat.postMessage...');
    await web.chat.postMessage({
      channel: config.slackChannelId,
      text: captionMessage,
    });

    console.log('[Slack] Files and caption successfully posted to Slack!');
    return uploadResponse;
  } catch (error) {
    console.error('[Slack] Failed to post files or message via Slack API:', error);
    throw error;
  }
}

async function sendAnalyticsReport(message) {
  if (!config.slackBotToken || !config.slackChannelId) {
    console.warn('[Slack] Analytics report skipped because Slack is not configured.');
    return null;
  }
  return web.chat.postMessage({ channel: config.slackChannelId, text: message });
}

async function sendPipelineFailure(error, selectedNews = {}) {
  if (!config.slackBotToken || !config.slackChannelId) return null;
  const title = selectedNews.title ? `\n기사: ${selectedNews.title}` : '';
  const recovery = Number.isInteger(error.repairAttempts)
    ? `\n자동 수정 시도: ${error.repairAttempts}회${error.repairError ? `\n수정 호출 오류: ${error.repairError}` : ''}`
    : '';
  const quality = error.qualityReport
    ? `\n품질 점수: ${error.qualityReport.score}/100\n${error.qualityReport.errors.join('\n')}`
    : '';
  const draft = error.draft
    ? `\n\n📝 수정 가능한 초안:\n${String(error.draft.instagram_caption || '').slice(0, 2200)}`
    : '';
  return web.chat.postMessage({
    channel: config.slackChannelId,
    text: `❌ 오늘경제 파이프라인이 게시 전에 중단됐어요.${title}${recovery}${quality}\n원인: ${error.message}${draft}`,
  });
}

module.exports = {
  sendAnalyticsReport,
  sendPipelineFailure,
  sendToSlack,
};
