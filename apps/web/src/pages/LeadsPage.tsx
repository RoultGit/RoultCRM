import { useEffect, useMemo, useState } from 'react';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { isAxiosError } from 'axios';
import { LINE_OPTIONS, BILLING_OPTIONS } from '@roult/shared';
import type { LeadDTO, CompanyDTO } from '@roult/shared';
import { firstPage } from '../hooks/usePagedQuery.js';
import { Pagination } from '../components/ui/pagination.js';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { CreateLeadDialog } from '../components/leads/CreateLeadDialog.js';
import { QualifyLeadDialog } from '../components/leads/QualifyLeadDialog.js';
import { useLeadsPaged, useSetLeadStatus, useConvertLead, useUpdateLead, useBulkAssignLeads, useBulkLeadStatus } from '../hooks/useLeads.js';
import { AssigneeCell } from '../components/AssigneeCell.js';
import { FilterBar, type FilterValue } from '../components/FilterBar.js';
import { EditDialog } from '../components/EditDialog.js';
import { updateLeadSchema } from '@roult/shared';
import { useUsers } from '../hooks/useUsers.js';
import { BulkBar } from '../components/BulkBar.js';

const STATUS_TONE: Record<LeadDTO['status'], 'info' | 'neutral' | 'warning' | 'success' | 'danger'> = {
  NEW: 'info',
  CONTACTED: 'neutral',
  QUALIFIED: 'warning',
  CONVERTED: 'success',
  UNQUALIFIED: 'danger',
  LOST: 'danger',
};

const STATUS_LABEL: Record<LeadDTO['status'], string> = {
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  QUALIFIED: 'Calificado',
  CONVERTED: 'Convertido',
  UNQUALIFIED: 'No calificado',
  LOST: 'Perdido',
};

// Every status a lead can be moved to by hand. CONVERTED is absent on purpose: it is only
// reachable through /convert, which also creates the Empresa and the Contacto.
const SELECTABLE_STATUS: Exclude<LeadDTO['status'], 'CONVERTED'>[] = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'UNQUALIFIED',
  'LOST',
];

const columnHelper = createColumnHelper<LeadDTO>();

export function LeadsPage() {
  const [filters, setFilters] = useState<FilterValue>({});
  const [page, setPage] = useState(firstPage);
  const { data, isLoading } = useLeadsPaged(filters, page);
  const leads = data?.items;

  // Al cambiar un filtro hay que volver a la primera página: si no, se filtra estando en la página
  // 3 y la lista aparece vacía aunque haya resultados.
  useEffect(() => setPage(firstPage), [JSON.stringify(filters)]);
  const setStatus = useSetLeadStatus();
  const convert = useConvertLead();
  const updateLead = useUpdateLead();
  const [duplicate, setDuplicate] = useState<{ lead: LeadDTO; company: CompanyDTO } | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [qualifying, setQualifying] = useState<LeadDTO | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const visibles = leads ?? [];
  const bulkAssign = useBulkAssignLeads();
  const bulkStatus = useBulkLeadStatus();
  const { data: equipo } = useUsers();

  // La selección se limpia al cambiar de página o de filtro: si no, quedan marcados ids que ya no
  // están en pantalla y la barra dice un número que no se corresponde con nada visible.
  useEffect(() => setSeleccion(new Set()), [page.offset, JSON.stringify(filters)]);

  const runConvert = (lead: LeadDTO, confirmDuplicate = false) =>
    convert.mutate(
      { id: lead.id, confirmDuplicate },
      {
        onSuccess: () => {
          setDuplicate(null);
          setBlocked(null);
        },
        onError: (err) => {
          if (!isAxiosError(err) || err.response?.status !== 409) return;
          // Un 409 sin `details` es una empresa de otro vendedor: el choque se avisa, la ficha no.
          const found = err.response.data.details?.duplicate as CompanyDTO | undefined;
          if (found) setDuplicate({ lead, company: found });
          else setBlocked(err.response.data.error as string);
        },
      }
    );

  const columns = useMemo(() => [
    columnHelper.display({
      id: 'seleccion',
      header: () => (
        <input
          type="checkbox"
          aria-label="Seleccionar todo lo que se ve"
          // Solo lo de ESTA página: decir "seleccionar todo" y actuar sobre 300 filas que nadie vio
          // es la forma más rápida de que alguien reasigne media cartera por error.
          checked={visibles.length > 0 && visibles.every((l) => seleccion.has(l.id))}
          onChange={(e) =>
            setSeleccion(e.target.checked ? new Set(visibles.map((l) => l.id)) : new Set())
          }
        />
      ),
      cell: (info) => (
        <input
          type="checkbox"
          aria-label={`Seleccionar ${info.row.original.businessName}`}
          checked={seleccion.has(info.row.original.id)}
          onChange={(e) => {
            // Dos cosas, y las dos hacen falta con clics rápidos:
            // 1. El valor se lee ACÁ y no adentro del actualizador. El actualizador corre después,
            //    y para entonces React ya devolvió el checkbox a su valor controlado.
            // 2. El actualizador es funcional. Armando el conjunto desde `seleccion`, tres clics en
            //    el mismo tick leen todos el mismo estado viejo y solo sobrevive el último.
            const marcado = e.target.checked;
            const id = info.row.original.id;
            setSeleccion((prev) => {
              const copia = new Set(prev);
              if (marcado) copia.add(id);
              else copia.delete(id);
              return copia;
            });
          }}
        />
      ),
    }),
    columnHelper.accessor('businessName', { header: 'Empresa / persona' }),
    columnHelper.accessor('contactName', { header: 'Contacto' }),
    columnHelper.accessor('representativeName', {
      header: 'Representante',
      cell: (info) => info.getValue() ?? '—',
    }),
    columnHelper.accessor('billingType', {
      header: 'Cobro',
      cell: (info) => (
        // "Suscripción mensual" partía la celda en dos renglones y engordaba toda la fila. La
        // columna ya dice "Cobro", así que la etiqueta corta alcanza.
        <Badge tone={info.getValue() === 'MONTHLY' ? 'info' : 'neutral'}>
          {info.getValue() === 'MONTHLY' ? 'Mensual' : 'Único'}
        </Badge>
      ),
    }),
    columnHelper.accessor('status', {
      header: 'Estado',
      cell: (info) => <Badge tone={STATUS_TONE[info.getValue()]}>{STATUS_LABEL[info.getValue()]}</Badge>,
    }),
    columnHelper.accessor('source', { header: 'Origen', cell: (info) => info.getValue() ?? '—' }),
    columnHelper.accessor('assignedUserId', {
      header: 'Vendedor',
      cell: ({ row }) => (
        <AssigneeCell
          assignedUserId={row.original.assignedUserId}
          disabled={updateLead.isPending && updateLead.variables?.id === row.original.id}
          onChange={(assignedUserId) => updateLead.mutate({ id: row.original.id, assignedUserId })}
        />
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => {
        const lead = row.original;
        const busy =
          (setStatus.isPending && setStatus.variables?.id === lead.id) ||
          (convert.isPending && convert.variables?.id === lead.id);
        if (lead.status === 'CONVERTED') return <span className="text-xs text-gray-400">—</span>;
        return (
          <div className="flex items-center gap-2">
            <EditDialog
              title="Editar lead"
              custom={{ entity: 'LEAD', recordId: lead.id }}
              schema={updateLeadSchema}
              isPending={updateLead.isPending}
              isError={updateLead.isError}
              values={{
                businessName: lead.businessName,
                contactName: lead.contactName,
                representativeName: lead.representativeName ?? '',
                billingType: lead.billingType,
                line: lead.line,
                email: lead.email ?? '',
                phone: lead.phone ?? '',
                whatsapp: lead.whatsapp ?? '',
                source: lead.source ?? '',
                notes: lead.notes ?? '',
              }}
              fields={[
                { key: 'businessName', label: 'Empresa / persona' },
                { key: 'contactName', label: 'Nombre de contacto' },
                { key: 'representativeName', label: 'Representante legal' },
                { key: 'billingType', label: 'Cobro', options: BILLING_OPTIONS },
                { key: 'line', label: 'Línea', options: LINE_OPTIONS },
                { key: 'email', label: 'Correo', type: 'email' },
                { key: 'phone', label: 'Teléfono' },
                { key: 'whatsapp', label: 'WhatsApp' },
                { key: 'source', label: 'Origen' },
                { key: 'notes', label: 'Notas', type: 'textarea' },
              ]}
              onSubmit={(data, close) => updateLead.mutate({ id: lead.id, ...data }, { onSuccess: close })}
            />
            <select
              className="rounded-lg border border-gray-200 px-2 py-1 text-sm"
              value={lead.status}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value as Exclude<LeadDTO['status'], 'CONVERTED'>;
                // Calificar es decir "esto es una venta": abre el paso que crea cliente y
                // oportunidad de una vez, en lugar de dejar el lead a mitad de camino.
                if (next === 'QUALIFIED') {
                  setQualifying(lead);
                  return;
                }
                setStatus.mutate({ id: lead.id, status: next });
              }}
            >
              {SELECTABLE_STATUS.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </select>
            {lead.status === 'QUALIFIED' && (
              <Button size="sm" disabled={busy} onClick={() => runConvert(lead)}>
                Convertir
              </Button>
            )}
          </div>
        );
      },
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [seleccion, visibles, setStatus, convert, updateLead]);

  const table = useReactTable({ data: leads ?? [], columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Leads</h1>
        <CreateLeadDialog />
      </div>
      <FilterBar
        value={filters}
        onChange={setFilters}
        exportPath="/leads/export"
        exportName="leads"
        fields={[
          {
            key: 'status',
            label: 'Estado',
            options: (['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'UNQUALIFIED', 'LOST'] as const).map((s) => ({
              value: s,
              label: STATUS_LABEL[s],
            })),
          },
          { key: 'assignedUserId', label: 'Vendedor', options: 'vendedores' },
          { key: 'billingType', label: 'Cobro', options: BILLING_OPTIONS },
          { key: 'line', label: 'Línea', options: LINE_OPTIONS },
        ]}
      />
      {duplicate ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            Ya existe una empresa parecida a <strong>{duplicate.lead.businessName}</strong>: {duplicate.company.name} (
            {duplicate.company.email ?? duplicate.company.whatsapp ?? 'sin contacto'}).
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDuplicate(null)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={convert.isPending} onClick={() => runConvert(duplicate.lead, true)}>
              Convertir de todas formas
            </Button>
          </div>
        </div>
      ) : (
        <>
          {blocked && <p className="mb-4 text-sm text-amber-700">{blocked}</p>}
          {convert.isError && !blocked && (
            <p className="mb-4 text-sm text-red-600">No se pudo convertir el lead.</p>
          )}
        </>
      )}
      {setStatus.isError && <p className="mb-4 text-sm text-red-600">No se pudo cambiar el estado del lead.</p>}
      {updateLead.isError && <p className="mb-4 text-sm text-red-600">No se pudo cambiar el vendedor asignado.</p>}
      <QualifyLeadDialog lead={qualifying} onClose={() => setQualifying(null)} />
      <BulkBar count={seleccion.size} onClear={() => setSeleccion(new Set())}>
        <select
          className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white"
          aria-label="Asignar los seleccionados a"
          value=""
          disabled={bulkAssign.isPending}
          onChange={(e) => {
            const valor = e.target.value;
            if (!valor) return;
            bulkAssign.mutate(
              { ids: [...seleccion], assignedUserId: valor === 'ninguno' ? null : valor },
              { onSuccess: () => setSeleccion(new Set()) }
            );
          }}
        >
          <option value="">Asignar a…</option>
          <option value="ninguno">Sin asignar</option>
          {(equipo ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.firstName} {u.lastName}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white"
          aria-label="Cambiar el estado de los seleccionados"
          value=""
          disabled={bulkStatus.isPending}
          onChange={(e) => {
            if (!e.target.value) return;
            bulkStatus.mutate(
              { ids: [...seleccion], status: e.target.value },
              { onSuccess: () => setSeleccion(new Set()) }
            );
          }}
        >
          <option value="">Marcar como…</option>
          {(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'LOST'] as const).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </BulkBar>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-gray-500">Cargando…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3 font-medium text-gray-600">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 last:border-0">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        <Pagination page={page} total={data?.total ?? 0} onChange={setPage} etiqueta="leads" />
      </Card>
    </div>
  );
}
