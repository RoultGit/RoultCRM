import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  DragOverlay,
  pointerWithin,
  closestCorners,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Clock, Pencil } from 'lucide-react';
import { updateTaskSchema, type TaskDTO, type UserDTO } from '@ventry/shared';
import { Badge } from '../ui/badge.js';
import { EditDialog } from '../EditDialog.js';
import { useSetTaskStatus, useUpdateTask } from '../../hooks/useTasks.js';
import { formatDate } from '../../lib/date.js';
import { OwnerAvatar, STATUS_META, TASK_STATUS, isTaskOverdue } from './shared.js';

// Igual que en el pipeline de deals: manda el cursor, y solo si quedó fuera de toda columna se cae
// a la más cercana. Con la detección por rectángulo, el cuerpo de la card pisa la columna de al
// lado antes que el mouse y la tarea aterriza donde no era.
const collisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : closestCorners(args);
};

function TaskCard({ task, users }: { task: TaskDTO; users?: UserDTO[] }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const update = useUpdateTask();
  const meta = STATUS_META[task.status];
  const Icon = meta.icon;
  const overdue = isTaskOverdue(task);

  // La card NO lleva el transform de dnd-kit: moviendo el mismo nodo que la librería mide, el rect
  // se re-mide ya desplazado y la columna detectada corre adelante del cursor. El que sigue al
  // mouse es el DragOverlay.
  return (
    <div
      ref={setNodeRef}
      className={`relative rounded-lg border bg-white p-3 ${
        isDragging
          ? 'border-dashed border-gray-300 opacity-40'
          : 'animate-card-in border-gray-200 shadow-sm'
      }`}
    >
      <div {...listeners} {...attributes} className="cursor-grab">
        <div className="flex items-start gap-2">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.dot}`} />
          <p
            className={`min-w-0 flex-1 pr-5 text-sm font-medium ${
              task.status === 'DONE' ? 'text-gray-500 line-through' : 'text-gray-900'
            }`}
          >
            {task.title}
          </p>
        </div>
        {task.description && <p className="mt-1 pl-6 text-xs text-gray-500">{task.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-gray-100 pt-2">
          <Badge tone={overdue ? 'danger' : 'neutral'}>{formatDate(task.dueDate)}</Badge>
          {task.dueTime && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              {task.dueTime}
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            <OwnerAvatar ownerId={task.ownerId} users={users} />
          </span>
        </div>
      </div>
      {/* Fuera de los listeners de arrastre: un click acá abriría un drag en vez del diálogo.
          El ícono va posicionado sobre la esquina en vez de ocupar su propia fila: con un botón
          "Editar" por card, diez cards apiladas eran diez botones idénticos gritando más fuerte que
          los títulos de las tareas. */}
      <div className="absolute right-2 top-2" onPointerDown={(e) => e.stopPropagation()}>
        <EditDialog
          trigger={
            <button
              aria-label={`Editar ${task.title}`}
              className="rounded-md p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          }
          title="Editar tarea"
          schema={updateTaskSchema}
          isPending={update.isPending}
          isError={update.isError}
          values={{
            title: task.title,
            description: task.description ?? '',
            dueDate: task.dueDate.slice(0, 10),
            dueTime: task.dueTime ?? '',
          }}
          fields={[
            { key: 'title', label: 'Título' },
            { key: 'dueDate', label: 'Fecha límite', type: 'date' },
            { key: 'dueTime', label: 'Hora (opcional)', type: 'time' },
            { key: 'description', label: 'Detalle', type: 'textarea' },
          ]}
          onSubmit={(data, close) => update.mutate({ id: task.id, ...data }, { onSuccess: close })}
        />
      </div>
    </div>
  );
}

function StatusColumn({
  status,
  tasks,
  users,
}: {
  status: (typeof TASK_STATUS)[number];
  tasks: TaskDTO[];
  users?: UserDTO[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.key });
  const Icon = status.icon;
  return (
    <div className="flex w-[260px] shrink-0 flex-col lg:w-auto lg:min-w-0 lg:flex-1">
      <div className="mb-2 flex items-center gap-2 px-1">
        <Icon className={`h-4 w-4 ${status.dot}`} />
        <span className="text-sm font-medium text-gray-900">{status.label}</span>
        <span className="text-xs text-gray-400">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-40 flex-col gap-2 rounded-xl p-2 transition-colors ${
          isOver ? 'bg-gray-200' : 'bg-gray-100'
        }`}
      >
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} users={users} />
        ))}
        {tasks.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-gray-400">Arrastrá una tarea acá.</p>
        )}
      </div>
    </div>
  );
}

export function TaskBoard({ tasks, users }: { tasks: TaskDTO[]; users?: UserDTO[] }) {
  const setStatus = useSetTaskStatus();
  const [active, setActive] = useState<TaskDTO | null>(null);
  const sensors = useSensors(useSensor(PointerSensor));

  const onDragStart = (event: DragStartEvent) =>
    setActive(tasks.find((task) => task.id === event.active.id) ?? null);

  const onDragEnd = (event: DragEndEvent) => {
    setActive(null);
    const status = event.over?.id as TaskDTO['status'] | undefined;
    const task = tasks.find((t) => t.id === event.active.id);
    if (status && task && task.status !== status) setStatus.mutate({ id: task.id, status });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      {/* min-w-[260px] por columna + scroll acá adentro: con flex-1 a secas, en un teléfono las
          tres columnas quedaban en 110px cada una y las cards no se podían leer. El deslizamiento
          vive en el tablero, no en la página. */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {TASK_STATUS.map((status) => (
          <StatusColumn
            key={status.key}
            status={status}
            tasks={tasks.filter((task) => task.status === status.key)}
            users={users}
          />
        ))}
      </div>
      {/* dropAnimation={null}: el update es optimista, así que la tarea ya está en la columna nueva
          cuando dnd-kit querría animar el overlay de vuelta al origen. Sin esto se ve "vuelve y
          después salta". */}
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="w-64 rotate-2 scale-105 cursor-grabbing rounded-lg border border-gray-300 bg-white p-3 shadow-xl ring-1 ring-black/5">
            <p className="text-sm font-medium text-gray-900">{active.title}</p>
            {active.description && <p className="mt-1 text-xs text-gray-500">{active.description}</p>}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
