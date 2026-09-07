import type { TaskDTO } from '@ventry/shared';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { useTasks, useUpdateTask } from '../hooks/useTasks.js';
import { CreateTaskDialog } from '../components/tasks/CreateTaskDialog.js';
import { EditDialog } from '../components/EditDialog.js';
import { updateTaskSchema } from '@ventry/shared';
import { formatDate, isOverdue as isDateOverdue, isToday as isDateToday } from '../lib/date.js';

function isOverdue(task: TaskDTO): boolean {
  return !task.done && isDateOverdue(task.dueDate);
}

function isToday(task: TaskDTO): boolean {
  return isDateToday(task.dueDate);
}

function TaskRow({ task }: { task: TaskDTO }) {
  const update = useUpdateTask();
  return (
    <li className="flex items-start gap-3 border-b border-gray-100 px-4 py-3 last:border-0">
      <input
        type="checkbox"
        className="mt-1"
        checked={task.done}
        disabled={update.isPending}
        onChange={(e) => update.mutate({ id: task.id, done: e.target.checked })}
        aria-label={`Marcar "${task.title}" como completada`}
      />
      <div className="flex-1">
        <p className={`text-sm ${task.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{task.title}</p>
        {task.description && <p className="text-xs text-gray-500">{task.description}</p>}
      </div>
      <Badge tone={isOverdue(task) ? 'danger' : 'neutral'}>{formatDate(task.dueDate)}</Badge>
      <EditDialog
        title="Editar tarea"
        schema={updateTaskSchema}
        isPending={update.isPending}
        isError={update.isError}
        values={{
          title: task.title,
          description: task.description ?? '',
          // El <input type="date"> quiere YYYY-MM-DD, y la fecha se guarda como medianoche UTC.
          dueDate: task.dueDate.slice(0, 10),
        }}
        fields={[
          { key: 'title', label: 'Título' },
          { key: 'dueDate', label: 'Fecha límite', type: 'date' },
          { key: 'description', label: 'Detalle', type: 'textarea' },
        ]}
        onSubmit={(data, close) => update.mutate({ id: task.id, ...data }, { onSuccess: close })}
      />
    </li>
  );
}

function TaskSection({ title, tasks }: { title: string; tasks: TaskDTO[] }) {
  if (tasks.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-medium text-gray-600">
        {title} ({tasks.length})
      </h2>
      <Card className="overflow-hidden">
        <ul>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

export function TasksPage() {
  const { data: tasks, isLoading } = useTasks();
  const all = tasks ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mi día</h1>
        <CreateTaskDialog />
      </div>
      {isLoading ? (
        <Card className="p-6 text-sm text-gray-500">Cargando…</Card>
      ) : all.length === 0 ? (
        <Card className="p-6 text-sm text-gray-500">No tienes tareas pendientes.</Card>
      ) : (
        <>
          <TaskSection title="Vencidas" tasks={all.filter(isOverdue)} />
          <TaskSection title="Hoy" tasks={all.filter((t) => !t.done && isToday(t))} />
          <TaskSection title="Próximas" tasks={all.filter((t) => !t.done && !isOverdue(t) && !isToday(t))} />
          <TaskSection title="Completadas" tasks={all.filter((t) => t.done)} />
        </>
      )}
    </div>
  );
}
