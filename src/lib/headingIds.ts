import { Children, isValidElement, type ReactNode } from 'react';

function nodeText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child);
      }
      if (isValidElement<{ children?: ReactNode }>(child)) {
        return nodeText(child.props.children);
      }
      return '';
    })
    .join('');
}

function slugifyHeading(value: string): string {
  const slug = value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}_\-\s]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
  return slug || 'section';
}

export function createHeadingIdFactory(prefix: string) {
  return (children: ReactNode): string => {
    const slug = slugifyHeading(nodeText(children));
    return `${prefix}-${slug}`;
  };
}
