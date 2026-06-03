const fs = require('fs');
const { WebClient } = require('@slack/web-api');
const config = require('../config');

// Initialize Slack WebClient
const web = new WebClient(config.slackBotToken);

/**
 * Uploads generated images and posts the Instagram caption to a Slack channel.
 * @param {Array<string>} imagePaths File paths of the 3 rendered PNG slides.
 * @param {string} instagramCaption The caption text generated for the Instagram post.
 */
async function sendToSlack(imagePaths, instagramCaption) {
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

  // Prepare caption text message referencing the upload
  const captionMessage = `📈 *오늘의 경제 카드 뉴스 생성 완료!*\n\n아래 점선 사이의 텍스트를 복사하여 인스타그램 본문 멘트로 사용하세요.\n\n-----------------------------\n\n${instagramCaption}\n\n-----------------------------`;

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

module.exports = {
  sendToSlack,
};
