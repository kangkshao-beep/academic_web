import { validateWeeklyBundle, WeeklyDataError } from './validate';
import type { WeeklyUniverseBundle } from './types';

export type WeeklyLoadFailure = 'authentication' | 'malformed' | 'unavailable';

export class WeeklyLoadError extends Error {
  constructor(public readonly kind: WeeklyLoadFailure, message: string) {
    super(message);
    this.name = 'WeeklyLoadError';
  }
}

async function fetchJson(pathname: string, signal: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(pathname, {
      cache: pathname.includes('/weekly/') ? 'no-store' : 'default',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new WeeklyLoadError('unavailable', 'Weekly topic data is unreachable.');
  }
  if (response.status === 401 || response.status === 403) {
    throw new WeeklyLoadError('authentication', 'Weekly topic authentication is required.');
  }
  if (!response.ok) {
    throw new WeeklyLoadError('unavailable', `Weekly topic data returned HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new WeeklyLoadError('malformed', 'Weekly topic data is not valid JSON.');
  }
}

export async function loadWeeklyUniverse(signal: AbortSignal): Promise<WeeklyUniverseBundle> {
  const [topics, library] = await Promise.all([
    fetchJson('/reading/weekly/data/topics.json', signal),
    fetchJson('/reading/data/library.json', signal),
  ]);
  try {
    return validateWeeklyBundle(topics, library);
  } catch (error) {
    if (error instanceof WeeklyDataError) {
      throw new WeeklyLoadError('malformed', error.message);
    }
    throw error;
  }
}
