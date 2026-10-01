import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
// Loopback-only fixture server. This credential never accesses production.
const server = spawn(process.execPath, ['scripts/serve-reading.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    READING_HOST: '127.0.0.1',
    READING_PORT: process.env.READING_PORT || '4173',
    READING_DATA_DIR: 'tests/fixtures/reading',
    READING_WEEKLY_DATA_DIR: 'tests/fixtures/reading-weekly',
    READING_WEEKLY_BASIC_AUTH_SHA256: createHash('sha256')
      .update('weekly-test:test-only-password')
      .digest('hex'),
  },
});
console.log(
  'DEMO preview: http://127.0.0.1:' +
    (process.env.READING_PORT || '4173') +
    '/reading/weekly/'
);
console.log('The public toy models open without login. The old fixture data API remains authenticated.');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
