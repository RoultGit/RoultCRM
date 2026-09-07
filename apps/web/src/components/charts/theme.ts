// Un solo lugar donde vive el aspecto de los gráficos. Recharts pinta con props sueltas, así que
// sin esto cada gráfico termina con su propio gris y el dashboard se desarma visualmente.
//
// La paleta es monocroma a propósito: los tonos de gris cargan la información y el color queda
// reservado para lo que de verdad es un resultado — verde ganado, rojo perdido. Es lo que hace que
// las referencias se vean tranquilas en vez de un arcoíris de series.
export const chart = {
  ink: '#111827', // gray-900, la serie principal
  inkSoft: '#6B7280', // gray-500, serie secundaria
  muted: '#E5E7EB', // gray-200, contexto y pistas de fondo
  grid: '#F3F4F6', // gray-100
  axis: '#9CA3AF', // gray-400
  won: '#059669', // emerald-600
  lost: '#DC2626', // red-600
} as const;

// Los ejes se dibujan sin línea ni ticks: la grilla horizontal ya da la referencia y las patitas
// solo agregan ruido. Es la diferencia entre un gráfico de librería y uno diseñado.
export const axisProps = {
  stroke: chart.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = {
  stroke: chart.grid,
  strokeDasharray: '0',
  vertical: false,
} as const;

// 600ms con salida suave: se lee como que el dato entra, no como una animación de presentación.
export const ANIMATION_MS = 600;

export const MONTH_LABEL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// "2026-09" → "Sep". Se parte el string en vez de construir un Date: `new Date('2026-09')` se
// interpreta como UTC y en cualquier offset negativo cae en agosto.
export function monthLabel(key: string): string {
  return MONTH_LABEL[Number(key.slice(5, 7)) - 1] ?? key;
}
