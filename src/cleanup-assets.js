const config = require('../config');
const { cleanupExpiredReleases } = require('./github-assets');

async function runCleanup() {
  const removed = await cleanupExpiredReleases({
    token: config.githubToken,
    repository: config.githubRepository,
    maxAgeHours: 72,
  });
  console.log(`[Cleanup] Removed ${removed.length} expired temporary releases.`);
  return removed;
}

if (require.main === module) {
  runCleanup().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runCleanup };
