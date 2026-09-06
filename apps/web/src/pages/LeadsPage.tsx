import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import type { LeadDTO } from '@ventry/shared';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { CreateLeadDialog } from '../components/leads/CreateLeadDialog.js';
import { useLeads, useSetLeadStatus, useConvertLead } from '../hooks/useLeads.js';

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

const NEXT_STATUS: Partial<Record<LeadDTO['status'], Exclude<LeadDTO['status'], 'CONVERTED'>>> = {
  NEW: 'CONTACTED',
  CONTACTED: 'QUALIFIED',
};

const columnHelper = createColumnHelper<LeadDTO>();

export function LeadsPage() {
  const { data: leads, isLoading } = useLeads();
  const setStatus = useSetLeadStatus();
  const convert = useConvertLead();

  const columns = [
    columnHelper.accessor('businessName', { header: 'Empresa / persona' }),
    columnHelper.accessor('contactName', { header: 'Contacto' }),
    columnHelper.accessor('status', {
      header: 'Estado',
      cell: (info) => <Badge tone={STATUS_TONE[info.getValue()]}>{STATUS_LABEL[info.getValue()]}</Badge>,
    }),
    columnHelper.accessor('source', { header: 'Origen', cell: (info) => info.getValue() ?? '—' }),
    columnHelper.display({
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => {
        const lead = row.original;
        const next = NEXT_STATUS[lead.status];
        const busy =
          (setStatus.isPending && setStatus.variables?.id === lead.id) ||
          (convert.isPending && convert.variables?.id === lead.id);
        if (lead.status === 'CONVERTED') return <span className="text-xs text-gray-400">—</span>;
        return (
          <div className="flex gap-2">
            {next && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setStatus.mutate({ id: lead.id, status: next })}>
                Marcar {STATUS_LABEL[next]}
              </Button>
            )}
            {lead.status === 'QUALIFIED' && (
              <Button size="sm" disabled={busy} onClick={() => convert.mutate({ id: lead.id })}>
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
      {convert.isError && (
        <p className="mb-4 text-sm text-red-600">No se pudo convertir el lead (puede que ya exista una empresa parecida).</p>
      )}
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
