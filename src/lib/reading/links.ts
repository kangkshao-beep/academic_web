function safeHttpUrl(value: string): string | null {
  // URL() normalizes spaces and malformed percent escapes instead of
  // rejecting them. Do that check before parsing so imported metadata cannot
  // silently turn into a different destination.
  if (/[%](?![0-9a-f]{2})/i.test(value) || /[\u0000-\u0020<>"`]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function encodeIdentifier(value: string): string {
  return value
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

export function arxivUrl(identifier: string | null): string | null {
  if (!identifier) return null;
  const direct = safeHttpUrl(identifier);
  if (direct) return direct;
  const normalized = identifier.replace(/^arxiv:\s*/i, '').trim();
  const valid = /^(?:\d{4}\.\d{4,5}|[a-z][a-z.-]+\/\d{7})(?:v\d+)?$/i.test(normalized);
  return valid ? `https://arxiv.org/abs/${encodeIdentifier(normalized)}` : null;
}

export function doiUrl(identifier: string | null): string | null {
  if (!identifier) return null;
  const direct = safeHttpUrl(identifier);
  if (direct) return direct;
  const normalized = identifier.replace(/^doi:\s*/i, '').trim();
  return /^10\.\d{4,9}\/\S+$/i.test(normalized)
    ? `https://doi.org/${encodeIdentifier(normalized)}`
    : null;
}

export function inspireUrl(identifier: string | null): string | null {
  if (!identifier) return null;
  const direct = safeHttpUrl(identifier);
  if (direct) return direct;
  const normalized = identifier.trim();
  return /^\d+$/.test(normalized)
    ? `https://inspirehep.net/literature/${encodeURIComponent(normalized)}`
    : null;
}

export function verifiedExternalUrl(value: string): string | null {
  return safeHttpUrl(value);
}
