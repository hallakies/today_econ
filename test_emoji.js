const text = ":eyes: 테스트";
const shortcode = ":eyes:";
const emoji = "👀";

const clean = text.replace(new RegExp(shortcode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), emoji);
console.log(clean);
