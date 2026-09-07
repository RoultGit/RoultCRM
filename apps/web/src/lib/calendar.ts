// Aritmética de calendario, toda en UTC. El sistema guarda las fechas como medianoche UTC y las
// compara así (ver lib/date.ts); una librería como date-fns trabaja en hora local por defecto y
// habría reintroducido el corrimiento de un día que este código evita a propósito. Para la cuenta
// que hace un calendario —sumar días, encontrar el lunes, armar la grilla del mes— alcanza con esto.

export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** "2026-09-07" a partir de un Date, leyendo en UTC. */
export function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function fromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

/** El lunes de la semana de `date`. Semana de lunes a domingo, que es como se lee acá. */
export function startOfWeek(date: Date): Date {
  // getUTCDay() da 0 para domingo; se convierte a 6 para que el lunes sea el día 0 de la semana.
  const offset = (date.getUTCDay() + 6) % 7;
  return addDays(date, -offset);
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

/**
 * Las semanas que dibuja la grilla del mes, como fechas ISO. Se arma con 6 y se descarta la última
 * si no tiene ni un día del mes: casi todos los meses entran en 5 filas, y dejar una fila entera de
 * días grises al final se lee como que el calendario está roto. Los días de relleno que sí hacen
 * falta (completar la primera y la última semana) se pintan atenuados.
 */
export function monthMatrix(date: Date): string[][] {
  const first = startOfWeek(startOfMonth(date));
  const weeks = Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => toIso(addDays(first, week * 7 + day)))
  );
  const last = weeks[weeks.length - 1];
  return last.every((iso) => !isSameMonth(iso, date)) ? weeks.slice(0, 5) : weeks;
}

export function weekDays(date: Date): string[] {
  const monday = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => toIso(addDays(monday, i)));
}

/** Franja horaria que se dibuja en la vista por horas. Fuera de esto no se agenda nada. */
export const HOUR_FROM = 7;
export const HOUR_TO = 20;
export const HOURS = Array.from({ length: HOUR_TO - HOUR_FROM + 1 }, (_, i) => HOUR_FROM + i);

/** "09:30" → 9.5, para ubicar el evento dentro de su franja. */
export function timeToDecimal(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours + minutes / 60;
}

export function isSameMonth(iso: string, date: Date): boolean {
  const d = fromIso(iso);
  return d.getUTCFullYear() === date.getUTCFullYear() && d.getUTCMonth() === date.getUTCMonth();
}

export function dayNumber(iso: string): number {
  return fromIso(iso).getUTCDate();
}
