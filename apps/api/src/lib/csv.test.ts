import { describe, it, expect } from 'vitest';
import { toCsv } from './csv.js';

describe('toCsv', () => {
  it('writes a header row and one row per record', () => {
    const csv = toCsv(
      [{ a: '1', b: '2' }],
      [
        { key: 'a', header: 'Uno' },
        { key: 'b', header: 'Dos' },
      ]
    );
    expect(csv).toBe('Uno,Dos\r\n1,2');
  });

  it('quotes values containing a comma, a quote or a newline', () => {
    const csv = toCsv(
      [{ a: 'Pérez, Juan', b: 'dijo "hola"', c: 'línea1\nlínea2' }],
      [
        { key: 'a', header: 'A' },
        { key: 'b', header: 'B' },
        { key: 'c', header: 'C' },
      ]
    );
    expect(csv).toBe('A,B,C\r\n"Pérez, Juan","dijo ""hola""","línea1\nlínea2"');
  });

  it('writes an empty cell for null and undefined', () => {
    const csv = toCsv(
      [{ a: null, b: undefined }],
      [
        { key: 'a', header: 'A' },
        { key: 'b', header: 'B' },
      ]
    );
    expect(csv).toBe('A,B\r\n,');
  });

  it('writes just the header when there are no rows', () => {
    expect(toCsv([], [{ key: 'a', header: 'A' }])).toBe('A');
  });
});
