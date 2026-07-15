const path = require('path');
require('dotenv').config();

module.exports = {
  groqApiKey: process.env.GROQ_API_KEY,
  hfToken: process.env.HF_TOKEN,
  pollinationsApiKey: process.env.POLLINATIONS_API_KEY,
  slackBotToken: process.env.SLACK_BOT_TOKEN,
  slackChannelId: process.env.SLACK_CHANNEL_ID,
  instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
  instagramTokenEncryptionKey: process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY,
  instagramUserId: process.env.INSTAGRAM_USER_ID,
  instagramApiVersion: process.env.INSTAGRAM_API_VERSION || 'v23.0',
  publishInstagram: process.env.PUBLISH_INSTAGRAM === 'true',
  githubToken: process.env.GITHUB_TOKEN,
  githubRepository: process.env.GITHUB_REPOSITORY,
  githubRunId: process.env.GITHUB_RUN_ID,
  githubSha: process.env.GITHUB_SHA,
  newsRssUrl: process.env.NEWS_RSS_URL || 'https://www.mk.co.kr/rss/30100041/',
  historyFile: process.env.HISTORY_FILE || path.join(__dirname, 'history.json'),
  postsFile: process.env.POSTS_FILE || path.join(__dirname, 'data', 'posts.json'),
  instagramTokenFile: process.env.INSTAGRAM_TOKEN_FILE || path.join(__dirname, 'data', 'instagram-token.enc'),
  maxHistoryDays: parseInt(process.env.MAX_HISTORY_DAYS || '7', 10),
};
