import { useState } from 'react';
import { Columns3, GanttChartSquare } from 'lucide-react';
import { Card } from '../components/ui/card.js';
import { useTasks } from '../hooks/useTasks.js';
import { useUsers } from '../hooks/useUsers.js';
import { CreateTaskDialog } from '../components/tasks/CreateTaskDialog.js';
import { TaskBoard } from '../components/tasks/TaskBoard.js';
import { TaskTimeline } from '../components/tasks/TaskTimeline.js';

const VIEWS = [
  { key: 'board', label: 'Tablero', icon: Columns3 },
  { key: 'timeline', label: 'Línea de tiempo', icon: GanttChartSquare },
] as const;

export function TasksPage() {
  // La vista vive en el componente y no en la URL a propósito: es una preferencia de cómo mirar lo
  // mismo, no un lugar distinto al que se llegue con un link.
  const [view, setView] = useState<(typeof VIEWS)[number]['key']>('board');
  const { data: tasks, isLoading } = useTasks();
  const { data: users } = useUsers();
  const all = tasks ?? [];

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
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    view === option.key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {option.label}
                </button>
              );
            })}
          </div>
          <CreateTaskDialog />
        </div>
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-gray-500">Cargando…</Card>
      ) : all.length === 0 ? (
        <Card className="p-10 text-center text-sm text-gray-500">
          No tenés tareas todavía. Creá la primera con “Agregar tarea”.
        </Card>
      ) : view === 'board' ? (
        <TaskBoard tasks={all} users={users} />
      ) : (
        <TaskTimeline tasks={all} users={users} />
      )}
    </div>
  );
}
