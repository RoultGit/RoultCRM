import { useState } from 'react';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { isAxiosError } from 'axios';
import type { LeadDTO, CompanyDTO } from '@ventry/shared';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { CreateLeadDialog } from '../components/leads/CreateLeadDialog.js';
import { useLeads, useSetLeadStatus, useConvertLead, useUpdateLead } from '../hooks/useLeads.js';
import { AssigneeCell } from '../components/AssigneeCell.js';

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
  const { data: leads, isLoading } = useLeads();
  const setStatus = useSetLeadStatus();
  const convert = useConvertLead();
  const updateLead = useUpdateLead();
  const [duplicate, setDuplicate] = useState<{ lead: LeadDTO; company: CompanyDTO } | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

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

  const columns = [
    columnHelper.accessor('businessName', { header: 'Empresa / persona' }),
    columnHelper.accessor('contactName', { header: 'Contacto' }),
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
            <select
              className="rounded-lg border border-gray-200 px-2 py-1 text-sm"
              value={lead.status}
              disabled={busy}
              onChange={(e) =>
                setStatus.mutate({ id: lead.id, status: e.target.value as Exclude<LeadDTO['status'], 'CONVERTED'> })
              }
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
  ];

  const table = useReactTable({ data: leads ?? [], columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Leads</h1>
        <CreateLeadDialog />
      </div>
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
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-gray-500">Cargando…</div>
        ) : (
          <table className="w-full text-left text-sm">
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
        )}
      </Card>
    </div>
  );
}
