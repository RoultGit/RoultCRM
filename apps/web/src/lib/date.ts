// Las fechas de próximo paso, cierre estimado y vencimiento de tarea son fechas de calendario, sin
// hora: el <input type="date"> manda "2026-09-01" y el backend lo guarda como medianoche UTC.
// Leerlas en la zona local las corre un día hacia atrás en cualquier offset negativo — en Lima
// (UTC-5) el usuario elige el 1 de septiembre y la ficha muestra el 31 de agosto. Así que se
// formatean y se comparan en UTC.

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-PE', { timeZone: 'UTC' });
}

// El día de hoy según el calendario del usuario, expresado como el mismo instante de medianoche
// UTC con el que se guardan las fechas, para poder compararlos directamente.
export function todayAsUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function isOverdue(iso: string | null): boolean {
  return !!iso && new Date(iso) < todayAsUTC();
}

export function isToday(iso: string): boolean {
  return new Date(iso).getTime() === todayAsUTC().getTime();
}
