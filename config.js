const path = require('path');
require('dotenv').config();

module.exports = {
  groqApiKey: process.env.GROQ_API_KEY,
  hfToken: process.env.HF_TOKEN,
  slackBotToken: process.env.SLACK_BOT_TOKEN,
  slackChannelId: process.env.SLACK_CHANNEL_ID,
  newsRssUrl: process.env.NEWS_RSS_URL || 'https://www.mk.co.kr/rss/30100041/',
  historyFile: process.env.HISTORY_FILE || path.join(__dirname, 'history.json'),
  maxHistoryDays: parseInt(process.env.MAX_HISTORY_DAYS || '7', 10),
};
