const { sanitizeText } = require('./src/generator');

const text = ":eyes: 정부출연 연구기관 평가 결과가 안 좋게 나왔어요. :chart_with_upwards_trend: AI 전환과 연구비 감소가 큰 원인이라는데, 우리도 미리 대비할 수 있겠죠? :memo: 지금 바로 공공데이터 포털에서 지원 현황을 확인하고, AI 교육 프로그램에 신청해보세요! :rotating_light: 정책 변화 알림을 설정해 최신 소식도 놓치지 마세요! :white_check_mark:";

console.log("Original: " + text);

// Duplicate the logic of sanitizeText to see if there's any scoping issue
const emojiMap = {
    ':chart_with_upwards_trend:': '📈',
    ':chart_with_downwards_trend:': '📉',
    ':mega:': '📢',
    ':eyes:': '👀',
    ':memo:': '📝',
    ':white_check_mark:': '✅',
    ':heavy_check_mark:': '✅',
    ':x:': '❌',
    ':warning:': '⚠️',
    ':rotating_light:': '🚨',
    ':bulb:': '💡',
    ':thinking:': '🧐',
    ':thinking_face:': '🤔',
    ':moneybag:': '💰',
    ':money_with_wings:': '💸',
    ':dollar:': '💵',
    ':yen:': '💴',
    ':euro:': '💶',
    ':credit_card:': '💳',
    ':exploding_head:': '🤯',
    ':bar_chart:': '📊',
    ':chart:': '📊',
    ':scissors:': '✂️',
    ':shield:': '🛡️',
    ':newspaper:': '📰',
    ':bell:': '🔔',
    ':loudspeaker:': '📢',
    ':speech_balloon:': '💬',
    ':thought_balloon:': '💭',
    ':exclamation:': '❗',
    ':question:': '❓',
    ':pushpin:': '📌',
    ':round_pushpin:': '📍',
    ':mag:': '🔍',
    ':pencil2:': '✏️',
    ':package:': '📦',
    ':truck:': '🚚',
    ':airplane:': '✈️',
    ':ship:': '🚢',
  };
  
  let clean = text;
  
  // Replace Slack shortcode emojis with real Unicode emojis
  for (const [shortcode, emoji] of Object.entries(emojiMap)) {
    clean = clean.replace(new RegExp(shortcode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), emoji);
  }

  // Catch-all: strip any remaining Slack-style :shortcode: patterns that weren't mapped
  clean = clean.replace(/:[a-z0-9_+-]+:/g, '');

  console.log("Cleaned: " + clean);
