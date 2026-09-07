import { describe, it, expect } from 'vitest';
import { monthMatrix, startOfWeek, weekDays, fromIso, toIso, addDays, timeToDecimal } from './calendar.js';

describe('aritmética del calendario', () => {
  it('arranca la semana el lunes', () => {
    // 2026-09-07 es lunes; 2026-09-13, domingo. Los dos caen en la misma semana.
    expect(toIso(startOfWeek(fromIso('2026-09-07')))).toBe('2026-09-07');
    expect(toIso(startOfWeek(fromIso('2026-09-13')))).toBe('2026-09-07');
    expect(weekDays(fromIso('2026-09-10'))).toEqual([
      '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13',
    ]);
  });

  it('no corre las fechas un día al cruzar la medianoche', () => {
    // El bug clásico de este código: construir las fechas en hora local hace que en Lima (UTC-5) el
    // día 1 se lea como el 31 del mes anterior. Todo pasa por UTC para que eso no ocurra.
    expect(toIso(fromIso('2026-09-01'))).toBe('2026-09-01');
    expect(toIso(addDays(fromIso('2026-09-30'), 1))).toBe('2026-10-01');
  });

  it('completa la grilla del mes con los días vecinos', () => {
    // Septiembre 2026 arranca martes: el lunes 31 de agosto abre la grilla.
    const weeks = monthMatrix(fromIso('2026-09-15'));
    expect(weeks[0][0]).toBe('2026-08-31');
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it('descarta la última semana cuando no tiene ningún día del mes', () => {
    // Septiembre 2026 entra en 5 filas; una sexta sería una fila entera de días grises.
    expect(monthMatrix(fromIso('2026-09-15'))).toHaveLength(5);
    // Agosto 2026 arranca sábado y necesita las 6.
    expect(monthMatrix(fromIso('2026-08-15'))).toHaveLength(6);
  });

  it('convierte la hora a la posición vertical del evento', () => {
    expect(timeToDecimal('09:30')).toBe(9.5);
    expect(timeToDecimal('00:00')).toBe(0);
    expect(timeToDecimal('23:45')).toBe(23.75);
  });
});
