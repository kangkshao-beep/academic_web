import { ReadingDataError, validateReadingBundle } from './validate';
import type { ReadingBundle } from './types';

const DATA_ROOT = '/reading/data';

export type ReadingLoadFailure = 'malformed' | 'unavailable';

export class ReadingLoadError extends Error {
  constructor(
    public readonly kind: ReadingLoadFailure,
    message: string
  ) {
    super(message);
    this.name = 'ReadingLoadError';
  }
}

async function fetchJson(filename: string, signal: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${DATA_ROOT}/${filename}`, {
      cache: 'default',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ReadingLoadError('unavailable', '无法连接到 Reading 数据服务。');
  }
  if (!response.ok) {
    throw new ReadingLoadError('unavailable', `Reading 数据服务暂不可用（HTTP ${response.status}）。`);
  }

  try {
    return await response.json();
  } catch {
    throw new ReadingLoadError('malformed', 'Reading 数据不是有效的 JSON。');
  }
}

export async function loadReadingBundle(signal: AbortSignal): Promise<ReadingBundle> {
  const [library, relations, threads, viewConfig] = await Promise.all([
    fetchJson('library.json', signal),
    fetchJson('relations.json', signal),
    fetchJson('threads.json', signal),
    fetchJson('view_config.json', signal),
  ]);

  try {
    return validateReadingBundle({ library, relations, threads, viewConfig });
  } catch (error) {
    if (error instanceof ReadingDataError) {
      throw new ReadingLoadError('malformed', error.message);
    }
    throw error;
  }
}
