import type { ReactNode } from 'react';

export function createHeadingIdFactory(prefix: string) {
  let index = 0;

  // Heading text is translated, but heading order is shared by locale files.
  // Ordinal IDs keep search-result anchors valid when a fallback locale matched.
  return (children: ReactNode): string => {
    void children;
    return `${prefix}-heading-${index++}`;
  };
}
