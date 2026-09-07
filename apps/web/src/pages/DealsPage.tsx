import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { DealDTO, UserDTO } from '@ventry/shared';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { useDeals, useSetDealStage, useAssignDeal } from '../hooks/useDeals.js';
import { useUsers } from '../hooks/useUsers.js';
import { useSession } from '../hooks/useAuth.js';
import { formatMoney } from '../lib/money.js';
import { CreateDealDialog } from '../components/deals/CreateDealDialog.js';
import { LostReasonDialog } from '../components/deals/LostReasonDialog.js';

// El orden del pipeline es el del spec de negocio, sección 22. PERDIDO va al final y fuera de la
// secuencia: es una salida, no un paso.
const STAGES: DealDTO['stage'][] = [
  'CONTACTO',
  'PROPUESTA',
  'NEGOCIACION',
  'ADELANTO',
  'PRODUCCION',
  'ENTREGADO',
  'MANTENIMIENTO',
  'PERDIDO',
];

const STAGE_LABEL: Record<DealDTO['stage'], string> = {
  CONTACTO: 'Contacto',
  PROPUESTA: 'Propuesta/Maqueta',
  NEGOCIACION: 'Negociación',
  ADELANTO: 'Adelanto',
  PRODUCCION: 'Producción',
  ENTREGADO: 'Entregado',
  MANTENIMIENTO: 'Mantenimiento',
  PERDIDO: 'Perdido',
};

function isOverdue(date: string | null): boolean {
  return !!date && new Date(date) < new Date(new Date().toDateString());
}

function DealCard({ deal, canAssign, users }: { deal: DealDTO; canAssign: boolean; users?: UserDTO[] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const assign = useAssignDeal();

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm ${isDragging ? 'opacity-50' : ''}`}
    >
      <div {...listeners} {...attributes} className="cursor-grab">
        <p className="text-sm font-medium text-gray-900">{deal.title}</p>
        <p className="text-xs text-gray-500">{deal.companyName}</p>
        <p className="mt-1 text-sm font-semibold text-gray-900">{formatMoney(deal.amount, deal.currency)}</p>
        {deal.nextStepDescription && (
          <p className={`mt-2 text-xs ${isOverdue(deal.nextStepDate) ? 'font-medium text-red-600' : 'text-gray-500'}`}>
            {deal.nextStepDescription}
            {deal.nextStepDate && ` · ${new Date(deal.nextStepDate).toLocaleDateString('es-PE')}`}
          </p>
        )}
        {deal.stage === 'PERDIDO' && deal.lostReason && (
          <p className="mt-2 text-xs text-gray-500">Motivo: {deal.lostReason}</p>
        )}
      </div>
      {canAssign && (
        <select
          className="mt-2 w-full rounded-md border border-gray-200 px-2 py-1 text-xs"
          value={deal.assignedUserId ?? ''}
          disabled={assign.isPending}
          // El select vive dentro de una card arrastrable: sin esto dnd-kit se come el pointerdown
          // y el desplegable no llega a abrirse.
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => assign.mutate({ id: deal.id, assignedUserId: e.target.value || undefined })}
        >
          <option value="">Sin asignar</option>
          {users?.map((user) => (
            <option key={user.id} value={user.id}>
              {user.firstName} {user.lastName}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function StageColumn({
  stage,
  deals,
  canAssign,
  users,
}: {
  stage: DealDTO['stage'];
  deals: DealDTO[];
  canAssign: boolean;
  users?: UserDTO[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div className="w-64 shrink-0">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{STAGE_LABEL[stage]}</span>
        <Badge tone="neutral">{deals.length}</Badge>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-40 flex-col gap-2 rounded-xl p-2 transition-colors ${
          isOver ? 'bg-gray-200' : 'bg-gray-100'
        }`}
      >
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} canAssign={canAssign} users={users} />
        ))}
      </div>
    </div>
  );
}

export function DealsPage() {
  const { data: deals, isLoading } = useDeals();
  const setStage = useSetDealStage();
  const { data: users } = useUsers();
  const canAssign = useSession().data?.role === 'ADMIN';
  const [lostDeal, setLostDeal] = useState<DealDTO | null>(null);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  const onDragEnd = (event: DragEndEvent) => {
    const stage = event.over?.id as DealDTO['stage'] | undefined;
    const deal = deals?.find((d) => d.id === event.active.id);
    if (!stage || !deal || deal.stage === stage) return;
    // PERDIDO exige un motivo (spec de negocio, sección 22), así que el drop abre el diálogo en vez
    // de mandar la mutación: sin motivo el backend responde 400 igual.
    if (stage === 'PERDIDO') {
      setLostDeal(deal);
      return;
    }
    setStage.mutate({ id: deal.id, stage });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pipeline</h1>
        <CreateDealDialog />
      </div>
      {setStage.isError && <p className="mb-4 text-sm text-red-600">No se pudo mover el deal de etapa.</p>}
      {isLoading ? (
        <Card className="p-6 text-sm text-gray-500">Cargando…</Card>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STAGES.map((stage) => (
              <StageColumn
                key={stage}
                stage={stage}
                deals={(deals ?? []).filter((d) => d.stage === stage)}
                canAssign={canAssign}
                users={users}
              />
            ))}
          </div>
        </DndContext>
      )}
      <LostReasonDialog deal={lostDeal} onClose={() => setLostDeal(null)} />
    </div>
  );
}
