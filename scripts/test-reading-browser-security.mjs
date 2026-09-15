import assert from 'node:assert/strict';
import {
  REMOTE_BROWSER_ENV_KEYS,
  assertNoAuthorizationHeader,
  consumeRemoteBrowserEnvironment,
  hasAuthorizationHeader,
  resolveBrowserDataMode,
} from './reading-browser-security.mjs';

const environment = {
  READING_BROWSER_ORIGIN: 'https://example.invalid',
  READING_BROWSER_DATA_MODE: 'synthetic',
  RETAINED_BROWSER_SETTING: 'retained',
};

const configuration = consumeRemoteBrowserEnvironment(environment);
assert(configuration.origin === 'https://example.invalid', 'Remote origin was not consumed.');
assert(configuration.dataMode === 'synthetic', 'Remote data mode was not consumed.');
assert(
  REMOTE_BROWSER_ENV_KEYS.every((key) => !Object.hasOwn(environment, key)),
  'A remote Reading browser variable remained in the child-process environment.'
);
assert(environment.RETAINED_BROWSER_SETTING === 'retained', 'An unrelated environment variable was removed.');

assert.equal(resolveBrowserDataMode(undefined, true), 'generic', 'Remote mode must default to generic smoke.');
assert.equal(resolveBrowserDataMode(undefined, false), 'synthetic', 'Local mode must retain full synthetic checks.');
assert.equal(resolveBrowserDataMode('generic', false), 'generic', 'Local generic smoke must remain available offline.');
assert.equal(resolveBrowserDataMode('synthetic', true), 'synthetic', 'Remote synthetic fixture checks must remain available.');
assert.throws(
  () => resolveBrowserDataMode('unexpected', true),
  /READING_BROWSER_DATA_MODE/,
  'Invalid browser data modes must be rejected.'
);

const authorization = 'redacted-test-value';
assert(hasAuthorizationHeader({ authorization }), 'Authorization presence was not detected.');
assert(hasAuthorizationHeader({ Authorization: authorization }), 'Capitalized Authorization presence was not detected.');
assert(!hasAuthorizationHeader({}), 'An absent Authorization header was reported as present.');

let denial;
try {
  assertNoAuthorizationHeader({ authorization }, 'Synthetic public request');
} catch (error) {
  denial = error;
}
assert(denial instanceof Error, 'A public Authorization header did not fail closed.');
assert(!denial.message.includes(authorization), 'Authorization value was copied into the failure message.');
assertNoAuthorizationHeader({}, 'Synthetic public request');

process.stdout.write('Reading public browser configuration checks passed (environment cleared and header values hidden).\n');
