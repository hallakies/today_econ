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

  // Prepare initial comment containing the ready-to-copy Instagram caption
  const commentText = `📈 *오늘의 경제 카드 뉴스 생성 완료!*\n\n아래 점선 사이의 텍스트를 복사하여 인스타그램 본문 멘트로 사용하세요.\n\n-----------------------------\n\n${instagramCaption}\n\n-----------------------------`;

  try {
    const response = await web.filesUploadV2({
      channel_id: config.slackChannelId,
      file_uploads: fileUploads,
      initial_comment: commentText,
    });

    console.log('[Slack] Files and caption successfully posted to Slack!');
    return response;
  } catch (error) {
    console.error('[Slack] Failed to upload files via Slack API:', error);
    throw error;
  }
}

module.exports = {
  sendToSlack,
};
