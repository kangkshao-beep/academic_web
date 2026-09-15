export const REMOTE_BROWSER_ENV_KEYS = [
  'READING_BROWSER_ORIGIN',
  'READING_BROWSER_USERNAME',
  'READING_BROWSER_PASSWORD',
  'READING_BROWSER_DATA_MODE',
];

export function consumeRemoteBrowserEnvironment(environment) {
  const configuration = {
    origin: environment.READING_BROWSER_ORIGIN,
    username: environment.READING_BROWSER_USERNAME,
    password: environment.READING_BROWSER_PASSWORD,
    dataMode: environment.READING_BROWSER_DATA_MODE,
  };

  for (const key of REMOTE_BROWSER_ENV_KEYS) delete environment[key];
  return configuration;
}

export function resolveBrowserDataMode(value, remoteMode) {
  const mode = value || (remoteMode ? 'generic' : 'synthetic');
  if (mode !== 'generic' && mode !== 'synthetic') {
    throw new Error('READING_BROWSER_DATA_MODE must be generic or synthetic.');
  }
  return mode;
}

export function hasAuthorizationHeader(headers) {
  return Object.keys(headers).some((name) => name.toLowerCase() === 'authorization');
}

export function assertNoAuthorizationHeader(headers, label) {
  if (hasAuthorizationHeader(headers)) {
    throw new Error(`${label} sent an HTTP Authorization header.`);
  }
}
