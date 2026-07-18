const test = require('node:test');
const assert = require('node:assert/strict');
const { publishToInstagram } = require('../src/index');

function createHarness({ failCarouselOnce = false, failVideoOnce = false } = {}) {
  const records = new Map();
  const calls = { reel: 0, carousel: 0, story: 0, release: 0, video: 0, reelCaption: '', carouselCaption: '' };
  let carouselShouldFail = failCarouselOnce;
  let videoShouldFail = failVideoOnce;
  const key = ({ articleUrl, format }) => `${articleUrl}|${format}`;
  return {
    calls,
    records,
    overrides: {
      cleanupExpiredReleases: async () => [],
      createReelVideo: async ({ outputPath }) => {
        calls.video += 1;
        if (videoShouldFail) {
          videoShouldFail = false;
          throw new Error('temporary video failure');
        }
        return outputPath;
      },
      createTemporaryRelease: async ({ assetPaths }) => {
        calls.release += 1;
        return {
          releaseId: `release-${calls.release}`,
          tag: `tag-${calls.release}`,
          imageUrls: assetPaths.filter(asset => asset.contentType === 'image/png').map((_, index) => `https://example.com/${index}.png`),
          videoUrl: assetPaths.some(asset => asset.contentType === 'video/mp4') ? 'https://example.com/reel.mp4' : null,
        };
      },
      publishReel: async ({ caption }) => {
        calls.reel += 1;
        calls.reelCaption = caption;
        return { id: 'reel-1', permalink: 'https://instagram.com/reel/one', timestamp: '2026-07-18T00:00:00Z' };
      },
      publishCarousel: async ({ caption }) => {
        calls.carousel += 1;
        calls.carouselCaption = caption;
        if (carouselShouldFail) {
          carouselShouldFail = false;
          throw new Error('temporary carousel failure');
        }
        return { id: 'carousel-1', permalink: 'https://instagram.com/p/one', timestamp: '2026-07-18T00:00:01Z' };
      },
      publishStory: async () => {
        calls.story += 1;
        return { id: 'story-1', timestamp: '2026-07-18T00:00:02Z' };
      },
      findPublishedPost: query => records.get(key(query)) || null,
      upsertPublishedPost: post => {
        records.set(key(post), { ...(records.get(key(post)) || {}), ...post });
      },
    },
  };
}

const content = {
  card1: { title: '청약통장 10만 명 해지', subtitle: '내 청약 계획을 다시 볼 때예요' },
  card2: { bullets: ['한 달 새 청약통장 가입자 10만 명이 줄었어요.', '분양가와 당첨 가능성 부담이 커졌어요.'] },
  card3: { bullets: ['청약 계획이 있다면 납입 유지 여부를 확인하세요.', '해지 전 재가입 불이익을 살펴보세요.'] },
  instagram_caption: '테스트 캡션',
  reel_caption: '짧은 릴스 캡션',
  content_metadata: { topic: '청약' },
  quality_score: 100,
};
const news = { title: '청약통장 기사', link: 'https://example.com/article' };

test('publishes Reel, Story, and Carousel independently and returns both feed formats', async () => {
  const harness = createHarness();
  const result = await publishToInstagram(['1.png', '2.png', '3.png'], content, news, 'token', harness.overrides);
  assert.equal(result.publications.reel.id, 'reel-1');
  assert.equal(result.publications.carousel.id, 'carousel-1');
  assert.equal(result.storyPublication.id, 'story-1');
  assert.equal(harness.calls.reel, 1);
  assert.equal(harness.calls.carousel, 1);
  assert.equal(harness.calls.story, 1);
  assert.equal(harness.calls.release, 2);
  assert.equal(harness.calls.video, 1);
  assert.equal(harness.calls.reelCaption, '짧은 릴스 캡션');
  assert.equal(harness.calls.carouselCaption, '테스트 캡션');
  assert.equal(harness.records.size, 2);
});

test('persists partial success and retries only the missing format', async () => {
  const harness = createHarness({ failCarouselOnce: true });
  await assert.rejects(
    publishToInstagram(['1.png', '2.png', '3.png'], content, news, 'token', harness.overrides),
    error => {
      assert.equal(error.publications.reel.id, 'reel-1');
      assert.equal(error.publications.carousel, null);
      assert.match(error.formatErrors.carousel, /temporary/);
      return true;
    }
  );

  const result = await publishToInstagram(['1.png', '2.png', '3.png'], content, news, 'token', harness.overrides);
  assert.equal(result.publications.reel.reused, true);
  assert.equal(result.publications.carousel.id, 'carousel-1');
  assert.equal(harness.calls.reel, 1);
  assert.equal(harness.calls.carousel, 2);
  assert.equal(harness.calls.story, 1);
  assert.equal(harness.calls.video, 1);
});

test('still publishes the Carousel when Reel video creation fails', async () => {
  const harness = createHarness({ failVideoOnce: true });
  await assert.rejects(
    publishToInstagram(['1.png', '2.png', '3.png'], content, news, 'token', harness.overrides),
    error => {
      assert.match(error.formatErrors.reel, /video creation/);
      assert.equal(error.publications.carousel.id, 'carousel-1');
      return true;
    }
  );
  assert.equal(harness.calls.reel, 0);
  assert.equal(harness.calls.carousel, 1);
  assert.equal(harness.records.get(`${news.link}|carousel`).mediaId, 'carousel-1');
});
