import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatDate, isOverdue, isToday, todayAsUTC } from './date.js';

afterEach(() => vi.useRealTimers());

describe('formatDate', () => {
  it('shows the calendar day that was picked, not the local shift of it', () => {
    // El bug que motivó este módulo: sin timeZone: 'UTC' esto da 31/8/2026 en Lima (UTC-5).
    expect(formatDate('2026-09-01T00:00:00.000Z')).toBe('1/9/2026');
  });
});

describe('isOverdue / isToday', () => {
  it('treats today as neither overdue nor future, from a negative-offset afternoon', () => {
    // 1 de septiembre, 20:00 en Lima = 2 de septiembre 01:00 UTC. El día local sigue siendo el 1.
    vi.setSystemTime(new Date('2026-09-02T01:00:00.000Z'));
    vi.stubEnv('TZ', 'America/Lima');
    const today = todayAsUTC().toISOString();

    expect(isToday(today)).toBe(true);
    expect(isOverdue(today)).toBe(false);
  });

  it('flags yesterday as overdue and tomorrow as not', () => {
    vi.setSystemTime(new Date('2026-09-01T15:00:00.000Z'));
    expect(isOverdue('2026-08-31T00:00:00.000Z')).toBe(true);
    expect(isOverdue('2026-09-02T00:00:00.000Z')).toBe(false);
  });

  it('treats a missing date as not overdue', () => {
    expect(isOverdue(null)).toBe(false);
  });
});
