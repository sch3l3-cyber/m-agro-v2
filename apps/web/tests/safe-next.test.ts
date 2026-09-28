import { describe, expect, it } from 'vitest';
import { safeNext } from '../src/features/auth/state';

describe('safeNext — zaštita od open redirecta', () => {
  it.each([
    ['/parcele', '/parcele'],
    ['/parcele?x=1', '/parcele?x=1'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['https://evil.com', '/'],
    ['', '/'],
    [null, '/'],
  ])('%s → %s', (input, out) => expect(safeNext(input)).toBe(out));
});
