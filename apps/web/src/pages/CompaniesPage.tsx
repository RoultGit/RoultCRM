import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import type { CompanyDTO } from '@ventry/shared';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { CreateCompanyDialog } from '../components/companies/CreateCompanyDialog.js';
import { useCompanies, useUpdateCompany } from '../hooks/useCompanies.js';
import { AssigneeCell } from '../components/AssigneeCell.js';
import { FilterBar, type FilterValue } from '../components/FilterBar.js';
import { EditDialog } from '../components/EditDialog.js';
import { updateCompanySchema } from '@ventry/shared';
import { useState } from 'react';

const columnHelper = createColumnHelper<CompanyDTO>();

export function CompaniesPage() {
  const [filters, setFilters] = useState<FilterValue>({});
  const { data: companies, isLoading } = useCompanies(filters);
  const updateCompany = useUpdateCompany();

  const columns = [
    columnHelper.accessor('name', { header: 'Empresa' }),
    columnHelper.accessor('line', {
      header: 'Línea',
      cell: (info) => <Badge tone={info.getValue() === 'WEB' ? 'info' : 'neutral'}>{info.getValue() === 'WEB' ? 'Web' : 'Software'}</Badge>,
    }),
    columnHelper.accessor('city', { header: 'Ciudad', cell: (info) => info.getValue() ?? '—' }),
    columnHelper.accessor('email', { header: 'Correo', cell: (info) => info.getValue() ?? '—' }),
    columnHelper.accessor('whatsapp', { header: 'WhatsApp', cell: (info) => info.getValue() ?? '—' }),
    columnHelper.display({
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <EditDialog
          title="Editar empresa"
          schema={updateCompanySchema}
          isPending={updateCompany.isPending}
          isError={updateCompany.isError}
          values={{
            name: row.original.name,
            line: row.original.line,
            city: row.original.city ?? '',
            email: row.original.email ?? '',
            whatsapp: row.original.whatsapp ?? '',
            source: row.original.source ?? '',
            notes: row.original.notes ?? '',
          }}
          fields={[
            { key: 'name', label: 'Nombre' },
            { key: 'line', label: 'Línea', options: [{ value: 'WEB', label: 'Web' }, { value: 'SOFTWARE', label: 'Software' }] },
            { key: 'city', label: 'Ciudad' },
            { key: 'email', label: 'Correo', type: 'email' },
            { key: 'whatsapp', label: 'WhatsApp' },
            { key: 'source', label: 'Origen' },
            { key: 'notes', label: 'Notas', type: 'textarea' },
          ]}
          onSubmit={(data, close) => updateCompany.mutate({ id: row.original.id, ...data }, { onSuccess: close })}
        />
      ),
    }),
    columnHelper.accessor('assignedUserId', {
      header: 'Vendedor',
      cell: ({ row }) => (
        <AssigneeCell
          assignedUserId={row.original.assignedUserId}
          disabled={updateCompany.isPending && updateCompany.variables?.id === row.original.id}
          onChange={(assignedUserId) => updateCompany.mutate({ id: row.original.id, assignedUserId })}
        />
      ),
    }),
  ];

  const table = useReactTable({ data: companies ?? [], columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Empresas</h1>
        <CreateCompanyDialog />
      </div>
      <FilterBar
        value={filters}
        onChange={setFilters}
        exportPath="/companies/export"
        exportName="empresas"
        fields={[
          { key: 'assignedUserId', label: 'Vendedor', options: 'vendedores' },
          { key: 'line', label: 'Línea', options: [{ value: 'WEB', label: 'Web' }, { value: 'SOFTWARE', label: 'Software' }] },
        ]}
      />
      {updateCompany.isError && (
        <p className="mb-4 text-sm text-red-600">No se pudo cambiar el vendedor asignado.</p>
      )}
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
      </Card>
    </div>
  );
}
