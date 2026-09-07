import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { Trash2 } from 'lucide-react';
import { LINE_OPTIONS, LINE_LABEL } from '@roult/shared';
import type { CompanyDTO } from '@roult/shared';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { CreateCompanyDialog } from '../components/companies/CreateCompanyDialog.js';
import { useCompanies, useUpdateCompany } from '../hooks/useCompanies.js';
import { useSession } from '../hooks/useAuth.js';
import { Button } from '../components/ui/button.js';
import { DeleteCompanyDialog } from '../components/companies/DeleteCompanyDialog.js';
import { AssigneeCell } from '../components/AssigneeCell.js';
import { FilterBar, type FilterValue } from '../components/FilterBar.js';
import { EditDialog } from '../components/EditDialog.js';
import { updateCompanySchema } from '@roult/shared';
import { useState } from 'react';

const columnHelper = createColumnHelper<CompanyDTO>();

export function CompaniesPage() {
  const [filters, setFilters] = useState<FilterValue>({});
  const { data: companies, isLoading } = useCompanies(filters);
  const updateCompany = useUpdateCompany();
  // Solo ADMIN. Es el caso "un empleado se equivocó": el vendedor carga mal la empresa y quien
  // manda la borra. El backend lo exige igual, esconder el botón no alcanza como control.
  const isAdmin = useSession().data?.role === 'ADMIN';
  const [companyToDelete, setCompanyToDelete] = useState<CompanyDTO | null>(null);

  const columns = [
    columnHelper.accessor('name', { header: 'Empresa' }),
    columnHelper.accessor('representativeName', {
      header: 'Representante',
      cell: (info) => info.getValue() ?? '—',
    }),
    columnHelper.accessor('line', {
      header: 'Línea',
      // La etiqueta sale de LINE_LABEL, no de un ternario: con `WEB ? 'Web' : 'Software'` cualquier
      // línea que no fuera Web se mostraba como "Software", así que Automatizaciones y Servicio
      // aparecían mal aunque el dato guardado estuviera bien. Un bug de esos no se nota mirando la
      // base, solo mirando la pantalla.
      cell: (info) => (
        <Badge tone={info.getValue() === 'WEB' ? 'info' : 'neutral'}>{LINE_LABEL[info.getValue()]}</Badge>
      ),
    }),
    columnHelper.accessor('city', { header: 'Ciudad', cell: (info) => info.getValue() ?? '—' }),
    columnHelper.accessor('email', { header: 'Correo', cell: (info) => info.getValue() ?? '—' }),
    columnHelper.accessor('whatsapp', { header: 'WhatsApp', cell: (info) => info.getValue() ?? '—' }),
    columnHelper.display({
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
        <EditDialog
          title="Editar empresa"
          schema={updateCompanySchema}
          isPending={updateCompany.isPending}
          isError={updateCompany.isError}
          values={{
            name: row.original.name,
            representativeName: row.original.representativeName ?? '',
            line: row.original.line,
            city: row.original.city ?? '',
            email: row.original.email ?? '',
            whatsapp: row.original.whatsapp ?? '',
            source: row.original.source ?? '',
            notes: row.original.notes ?? '',
          }}
          fields={[
            { key: 'name', label: 'Nombre' },
            { key: 'representativeName', label: 'Representante legal' },
            { key: 'line', label: 'Línea', options: LINE_OPTIONS },
            { key: 'city', label: 'Ciudad' },
            { key: 'email', label: 'Correo', type: 'email' },
            { key: 'whatsapp', label: 'WhatsApp' },
            { key: 'source', label: 'Origen' },
            { key: 'notes', label: 'Notas', type: 'textarea' },
          ]}
          onSubmit={(data, close) => updateCompany.mutate({ id: row.original.id, ...data }, { onSuccess: close })}
        />
        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            className="px-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
            aria-label={`Eliminar ${row.original.name}`}
            title="Eliminar empresa"
            onClick={() => setCompanyToDelete(row.original)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        </div>
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
          { key: 'line', label: 'Línea', options: LINE_OPTIONS },
        ]}
      />
      {updateCompany.isError && (
        <p className="mb-4 text-sm text-red-600">No se pudo cambiar el vendedor asignado.</p>
      )}
      <DeleteCompanyDialog company={companyToDelete} onClose={() => setCompanyToDelete(null)} />
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
