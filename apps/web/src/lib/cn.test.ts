import { describe, it, expect } from 'vitest';
import { cn } from './cn.js';

describe('cn', () => {
  it('joins truthy class names and drops falsy ones', () => {
    expect(cn('a', false, undefined, 'b')).toBe('a b');
  });

  it('merges conflicting tailwind classes, keeping the last', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
