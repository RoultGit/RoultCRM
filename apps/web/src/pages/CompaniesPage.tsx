import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import type { CompanyDTO } from '@ventry/shared';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { CreateCompanyDialog } from '../components/companies/CreateCompanyDialog.js';
import { useCompanies } from '../hooks/useCompanies.js';

const columnHelper = createColumnHelper<CompanyDTO>();

export function CompaniesPage() {
  const { data: companies, isLoading } = useCompanies();

  const columns = [
    columnHelper.accessor('name', { header: 'Empresa' }),
    columnHelper.accessor('line', {
      header: 'Línea',
      cell: (info) => <Badge tone={info.getValue() === 'WEB' ? 'info' : 'neutral'}>{info.getValue() === 'WEB' ? 'Web' : 'Software'}</Badge>,
    }),
    columnHelper.accessor('city', { header: 'Ciudad', cell: (info) => info.getValue() ?? '—' }),
    columnHelper.accessor('email', { header: 'Correo', cell: (info) => info.getValue() ?? '—' }),
    columnHelper.accessor('whatsapp', { header: 'WhatsApp', cell: (info) => info.getValue() ?? '—' }),
  ];

  const table = useReactTable({ data: companies ?? [], columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Empresas</h1>
        <CreateCompanyDialog />
      </div>
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
