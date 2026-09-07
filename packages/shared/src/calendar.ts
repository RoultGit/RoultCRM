import { z } from 'zod';

// El calendario no tiene entidad propia: es una vista sobre lo que ya existe. Un CRM donde el
// calendario solo mostrara tareas dejaría afuera lo que de verdad tiene fecha y aprieta — el
// próximo paso de una venta y el cierre estimado.
export const calendarSourceSchema = z.enum(['TASK', 'DEAL_NEXT_STEP', 'DEAL_CLOSE']);

export const calendarRangeSchema = z.object({
  from: z.string().date('Ingresa una fecha válida'),
  to: z.string().date('Ingresa una fecha válida'),
});

export interface CalendarEventDTO {
  // El id no es único entre fuentes distintas: un deal aparece dos veces, una por su próximo paso y
  // otra por su cierre. Por eso la key de React se arma con source + id, no con id solo.
  id: string;
  source: z.infer<typeof calendarSourceSchema>;
  title: string;
  subtitle: string | null;
  date: string;
  // null = evento de todo el día, va a la fila de arriba de la vista por horas.
  time: string | null;
  ownerId: string | null;
  done: boolean;
}
