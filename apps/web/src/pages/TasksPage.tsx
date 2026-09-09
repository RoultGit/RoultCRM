import { useState } from 'react';
import { Columns3, GanttChartSquare } from 'lucide-react';
import { PRIORITY_OPTIONS, type TaskDTO, type TaskPriority } from '@roult/shared';
import { Card } from '../components/ui/card.js';
import { useTasks } from '../hooks/useTasks.js';
import { useUsers } from '../hooks/useUsers.js';
import { CreateTaskDialog } from '../components/tasks/CreateTaskDialog.js';
import { TaskBoard } from '../components/tasks/TaskBoard.js';
import { TaskTimeline } from '../components/tasks/TaskTimeline.js';
import { TaskProgressDialog } from '../components/tasks/TaskProgressDialog.js';

const VIEWS = [
  { key: 'board', label: 'Tablero', icon: Columns3 },
  { key: 'timeline', label: 'Línea de tiempo', icon: GanttChartSquare },
] as const;

export function TasksPage() {
  // La vista vive en el componente y no en la URL a propósito: es una preferencia de cómo mirar lo
  // mismo, no un lugar distinto al que se llegue con un link.
  const [view, setView] = useState<(typeof VIEWS)[number]['key']>('board');
  // El filtro se aplica en el cliente y no en el servidor: la lista de tareas de una persona es
  // chica, ya está toda en memoria, y así el tablero responde sin ir y volver a la red.
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [progressTask, setProgressTask] = useState<TaskDTO | null>(null);
  const { data: tasks, isLoading } = useTasks();
  const { data: users } = useUsers();
  const all = (tasks ?? []).filter((task) => !priority || task.priority === priority);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Tareas</h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            {VIEWS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.key}
                  onClick={() => setView(option.key)}
                  aria-pressed={view === option.key}
                  // whitespace-nowrap: en un teléfono "Línea de tiempo" se partía en dos renglones y
                  // estiraba toda la fila de controles al doble de alto.
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    view === option.key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {option.label}
                </button>
              );
            })}
          </div>
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority | '')}
            aria-label="Filtrar por prioridad"
          >
            <option value="">Prioridad: todas</option>
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <CreateTaskDialog />
        </div>
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-gray-500">Cargando…</Card>
      ) : all.length === 0 ? (
        <Card className="p-10 text-center text-sm text-gray-500">
          {priority
            ? 'No hay tareas con esa prioridad.'
            : 'No tenés tareas todavía. Creá la primera con “Agregar tarea”.'}
        </Card>
      ) : view === 'board' ? (
        <TaskBoard tasks={all} users={users} onOpenProgress={setProgressTask} />
      ) : (
        <TaskTimeline tasks={all} users={users} />
      )}

      {/* Se le pasa la tarea recién leída de la lista y no la guardada en el estado: al registrar un
          avance, la lista se refresca y el diálogo tiene que mostrar el número nuevo, no el viejo. */}
      <TaskProgressDialog
        task={progressTask ? (all.find((t) => t.id === progressTask.id) ?? progressTask) : null}
        users={users}
        onClose={() => setProgressTask(null)}
      />
    </div>
  );
}
