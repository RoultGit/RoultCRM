import {
  Area,
  LabelList,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PRIORITY_LABEL, type DashboardChartsDTO, type DashboardDTO, type TaskPriority } from '@roult/shared';
import { ChartCard, ChartEmpty, ChartTooltip } from './ChartCard.js';
import { chart, axisProps, gridProps, ANIMATION_MS, monthLabel } from './theme.js';
import { formatMoney } from '../../lib/money.js';

const STAGE_LABEL: Record<string, string> = {
  CONTACTO: 'Contacto',
  PROPUESTA: 'Propuesta',
  NEGOCIACION: 'Negociación',
  ADELANTO: 'Adelanto',
  PRODUCCION: 'Producción',
  ENTREGADO: 'Entregado',
  MANTENIMIENTO: 'Mantenim.',
  PERDIDO: 'Perdido',
};

function Legend({ items }: { items: { name: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {items.map((item) => (
        <span key={item.name} className="flex items-center gap-1.5 text-xs text-gray-500">
          <span
            className="h-0.5 w-3 rounded-full"
            style={
              item.dashed
                ? { backgroundImage: `repeating-linear-gradient(90deg, ${item.color} 0 3px, transparent 3px 6px)` }
                : { backgroundColor: item.color }
            }
          />
          {item.name}
        </span>
      ))}
    </div>
  );
}

// ── 1. Evolución mensual ──────────────────────────────────────────────────────
// Barras para el volumen (cuántos deals nacieron) y líneas para el resultado. Dos codificaciones
// distintas en vez de tres barras juntas: con tres series del mismo tipo hay que ir a la leyenda
// para leer cada grupo, y así se entiende de un vistazo cuál es el fondo y cuál el resultado.
export function MonthlyTrend({ data, className }: { data: DashboardChartsDTO['monthly']; className?: string }) {
  const empty = data.every((point) => point.created === 0 && point.won === 0 && point.lost === 0);
  return (
    <ChartCard
      title="Evolución mensual"
      hint="Deals creados, ganados y perdidos"
      height={260}
      className={className}
      action={
        <Legend
          items={[
            { name: 'Creados', color: chart.muted },
            { name: 'Ganados', color: chart.ink },
            { name: 'Perdidos', color: chart.lost, dashed: true },
          ]}
        />
      }
    >
      {empty ? (
        <ChartEmpty>Todavía no hay deals en este período.</ChartEmpty>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="month" tickFormatter={monthLabel} {...axisProps} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip
              cursor={{ fill: chart.grid }}
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  label={monthLabel(String(label))}
                  rows={(payload ?? []).map((p) => ({
                    name: String(p.name),
                    value: Number(p.value),
                    color: p.color,
                  }))}
                />
              )}
            />
            <Bar
              dataKey="created"
              name="Creados"
              fill={chart.muted}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              animationDuration={ANIMATION_MS}
            />
            <Line
              type="monotone"
              dataKey="won"
              name="Ganados"
              stroke={chart.ink}
              strokeWidth={2}
              dot={{ r: 3, fill: '#fff', strokeWidth: 2 }}
              activeDot={{ r: 4 }}
              animationDuration={ANIMATION_MS}
            />
            <Line
              type="monotone"
              dataKey="lost"
              name="Perdidos"
              stroke={chart.lost}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              dot={false}
              animationDuration={ANIMATION_MS}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ── 2. Resultado del pipeline ─────────────────────────────────────────────────
export function OutcomeDonut({ summary, className }: { summary: DashboardDTO; className?: string }) {
  const slices = [
    // Monocromo + rojo, igual que el resto del dashboard. Con el verde saturado el anillo parecía
    // traído de otro sistema de diseño; acá el negro carga el resultado bueno, el gris lo que
    // todavía no se sabe, y el rojo queda como único color con significado.
    { name: 'En juego', value: summary.dealsActive, color: chart.muted },
    { name: 'Ganados', value: summary.dealsWon, color: chart.ink },
    { name: 'Perdidos', value: summary.dealsLost, color: chart.lost },
  ];
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <ChartCard title="Resultado" hint="Todos los deals" height={260} className={className}>
      {total === 0 ? (
        <ChartEmpty>Todavía no hay deals.</ChartEmpty>
      ) : (
        <div className="flex h-full flex-col">
          <div className="relative min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  // El agujero del medio es lo que convierte una torta en un dato: el total va ahí,
                  // en vez de sumar a ojo las porciones.
                  innerRadius="66%"
                  outerRadius="92%"
                  paddingAngle={2}
                  stroke="none"
                  animationDuration={ANIMATION_MS}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.name} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => (
                    <ChartTooltip
                      active={active}
                      rows={(payload ?? []).map((p) => ({
                        name: String(p.name),
                        value: `${p.value} · ${Math.round((Number(p.value) / total) * 100)}%`,
                        color: p.payload?.color,
                      }))}
                    />
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* pointer-events-none: si no, el texto del centro se come el hover del anillo. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold text-gray-900">{total}</span>
              <span className="text-xs text-gray-500">deals</span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {slices.map((slice) => (
              <div key={slice.name} className="min-w-0">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                  <span className="truncate">{slice.name}</span>
                </span>
                <span className="text-sm font-medium text-gray-900">{slice.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

// ── 3. Pipeline por etapa ─────────────────────────────────────────────────────
// Horizontal y no vertical: los nombres de las etapas son largos y en vertical quedarían rotados o
// cortados. Acá se leen de corrido.
export function StageBars({ data, className }: { data: DashboardChartsDTO['pipelineByStage']; className?: string }) {
  const rows = data.map((row) => ({ ...row, label: STAGE_LABEL[row.stage] ?? row.stage }));
  const empty = rows.every((row) => row.count === 0);
  return (
    <ChartCard title="Pipeline por etapa" hint="Cuántos deals hay en cada paso" height={260} className={className}>
      {empty ? (
        <ChartEmpty>Todavía no hay deals en el pipeline.</ChartEmpty>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid {...gridProps} vertical horizontal={false} />
            <XAxis type="number" allowDecimals={false} {...axisProps} />
            <YAxis type="category" dataKey="label" width={78} {...axisProps} />
            <Tooltip
              cursor={{ fill: chart.grid }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                return (
                  <ChartTooltip
                    active={active}
                    label={row?.label}
                    rows={
                      row
                        ? [
                            { name: 'Deals', value: row.count },
                            { name: 'PEN', value: formatMoney(row.amount.PEN, 'PEN') },
                            { name: 'USD', value: formatMoney(row.amount.USD, 'USD') },
                          ]
                        : []
                    }
                  />
                );
              }}
            />
            <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={11} animationDuration={ANIMATION_MS}>
              {/* El número al final de la barra evita tener que ir al eje a estimarlo. Con la barra
                  fina, la etiqueta pasa a ser la que lleva el dato exacto. */}
              <LabelList dataKey="count" position="right" fontSize={11} fill={chart.axis} />
              {rows.map((row) => (
                // Perdido en rojo: es la única etapa que no es un paso adelante, y verla del mismo
                // color que el resto la hacía parecer parte del avance.
                <Cell key={row.stage} fill={row.stage === 'PERDIDO' ? chart.lost : chart.ink} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ── 4. Facturación ganada por mes ─────────────────────────────────────────────
export function WonAmountArea({ data, className }: { data: DashboardChartsDTO['monthly']; className?: string }) {
  const empty = data.every((point) => Number(point.wonAmountPEN) === 0);
  return (
    <ChartCard title="Ganado por mes" hint="Solo PEN" height={260} className={className}>
      {empty ? (
        <ChartEmpty>Todavía no hay deals ganados en soles.</ChartEmpty>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              {/* El degradado que se desvanece hacia abajo es lo que hace que el área se lea como
                  volumen y no como un bloque sólido tapando la grilla. */}
              <linearGradient id="wonFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chart.ink} stopOpacity={0.16} />
                <stop offset="100%" stopColor={chart.ink} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="month" tickFormatter={monthLabel} {...axisProps} />
            <YAxis
              {...axisProps}
              width={46}
              // 12500 → "12.5k": el eje no puede llevar el monto completo sin comerse el gráfico.
              tickFormatter={(value: number) => (value >= 1000 ? `${value / 1000}k` : String(value))}
            />
            <Tooltip
              cursor={{ stroke: chart.muted }}
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  label={monthLabel(String(label))}
                  rows={(payload ?? []).map((p) => ({
                    name: 'Ganado',
                    value: formatMoney(String(p.value ?? '0'), 'PEN'),
                  }))}
                />
              )}
            />
            <Area
              type="monotone"
              dataKey="wonAmountPEN"
              stroke={chart.ink}
              strokeWidth={2}
              fill="url(#wonFill)"
              dot={false}
              activeDot={{ r: 4 }}
              animationDuration={ANIMATION_MS}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ── 5. Lista con barra de proporción ──────────────────────────────────────────
// No usa Recharts: son cinco filas con una barra proporcional. Montar un gráfico entero para esto
// pesaría más que el dato, y así las filas se alinean con la tipografía del resto de la app.
function ProportionList({ rows }: { rows: { label: string; value: number; caption?: string }[] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  // justify-start y no center: con distinta cantidad de filas, centrar dejaba a "Por vendedor"
  // flotando y desalineado con la card de al lado.
  return (
    <ul className="flex h-full flex-col gap-3 overflow-y-auto">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="truncate text-sm text-gray-700">{row.label}</span>
            <span className="shrink-0 text-sm font-medium text-gray-900">{row.caption ?? row.value}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gray-900 transition-[width] duration-700 ease-out"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SourceList({ data, className }: { data: DashboardChartsDTO['leadsBySource']; className?: string }) {
  return (
    <ChartCard title="Leads por origen" hint="De dónde vienen los prospectos" height={260} className={className}>
      {data.length === 0 ? (
        <ChartEmpty>Todavía no hay leads cargados.</ChartEmpty>
      ) : (
        <ProportionList rows={data.map((row) => ({ label: row.source, value: row.count }))} />
      )}
    </ChartCard>
  );
}

export function SellerList({ data, className }: { data: DashboardChartsDTO['bySeller']; className?: string }) {
  return (
    <ChartCard title="Por vendedor" hint="Ganado en el período, en soles" height={260} className={className}>
      {data.length === 0 ? (
        <ChartEmpty>Todavía no hay vendedores con deals.</ChartEmpty>
      ) : (
        <ProportionList
          rows={data.slice(0, 6).map((row) => ({
            label: row.name,
            value: Number(row.wonAmountPEN),
            caption: formatMoney(row.wonAmountPEN, 'PEN'),
          }))}
        />
      )}
    </ChartCard>
  );
}

// ── 6. Sparkline de las tarjetas de arriba ────────────────────────────────────
// Micro-gráfico sin ejes ni tooltip: no está para leer valores, está para que el número grande
// tenga contexto de si viene subiendo o cayendo. Es el detalle de las tarjetas de dashboard1.
export function Sparkline({ values, tone = 'ink' }: { values: number[]; tone?: 'ink' | 'lost' }) {
  if (values.length === 0 || values.every((value) => value === 0)) return null;
  const data = values.map((value, i) => ({ i, value }));
  return (
    <div className="h-8 w-16 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <Bar
            dataKey="value"
            fill={tone === 'lost' ? chart.lost : chart.ink}
            radius={[1, 1, 0, 0]}
            animationDuration={ANIMATION_MS}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 7. Tareas por prioridad ───────────────────────────────────────────────────
// Barras apiladas: lo pendiente y lo hecho de cada prioridad, uno encima del otro. Apiladas y no
// agrupadas porque la pregunta real es "cuánto hay de esto y cuánto falta", no comparar dos series.
const PRIORITY_FILL: Record<string, string> = {
  URGENT: '#FB7185',
  HIGH: '#FBBF24',
  MEDIUM: '#7DD3FC',
  LOW: '#D1D5DB',
};

export function TaskPriorityChart({
  data,
  className,
}: {
  data: DashboardChartsDTO['tasksByPriority'];
  className?: string;
}) {
  const rows = data.map((row) => ({
    ...row,
    label: PRIORITY_LABEL[row.priority as TaskPriority] ?? row.priority,
  }));
  const empty = rows.every((row) => row.pending === 0 && row.done === 0);
  return (
    <ChartCard
      title="Tareas por prioridad"
      hint="Cuánto falta en cada nivel"
      height={260}
      className={className}
      // La leyenda decía "Pendientes" con un cuadrito negro, pero las barras pendientes van en el
      // color de SU prioridad, no en negro: el gráfico se contradecía a sí mismo. Se explica en
      // texto en vez de fingir un color que ninguna barra tiene.
      action={
        <span className="text-xs text-gray-500">
          Pendientes en su color · <span className="text-gray-400">hechas en gris</span>
        </span>
      }
    >
      {empty ? (
        <ChartEmpty>Todavía no hay tareas cargadas.</ChartEmpty>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip
              cursor={{ fill: chart.grid }}
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  label={String(label)}
                  rows={(payload ?? []).map((p) => ({
                    name: String(p.name),
                    value: Number(p.value),
                    color: p.color,
                  }))}
                />
              )}
            />
            {/* Lo pendiente lleva el color de su prioridad; lo hecho va en gris. Lo terminado ya no
                necesita gritar, y así el gráfico se lee como "cuánto rojo queda". */}
            <Bar dataKey="pending" name="Pendientes" stackId="t" maxBarSize={44} animationDuration={ANIMATION_MS}>
              {rows.map((row) => (
                <Cell key={row.priority} fill={PRIORITY_FILL[row.priority] ?? chart.ink} />
              ))}
            </Bar>
            <Bar
              dataKey="done"
              name="Hechas"
              stackId="t"
              fill={chart.muted}
              radius={[4, 4, 0, 0]}
              maxBarSize={44}
              animationDuration={ANIMATION_MS}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ── 8. Quién cierra tareas ────────────────────────────────────────────────────
export function TaskPeopleList({
  data,
  className,
}: {
  data: DashboardChartsDTO['taskPeople'];
  className?: string;
}) {
  return (
    <ChartCard title="Tareas por persona" hint="Cerradas en el período" height={260} className={className}>
      {data.length === 0 ? (
        <ChartEmpty>Nadie cerró tareas en este período.</ChartEmpty>
      ) : (
        <ProportionList
          rows={data.slice(0, 6).map((row) => ({
            label: row.name,
            value: row.completed,
            // Cerradas y creadas juntas: quien cierra mucho y crea poco está ejecutando lo que otros
            // planifican, y al revés. Un solo número escondería esa diferencia.
            caption: `${row.completed} cerradas · ${row.created} creadas`,
          }))}
        />
      )}
    </ChartCard>
  );
}
