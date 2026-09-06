import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import type { ContactDTO } from '@ventry/shared';
import { Card } from '../components/ui/card.js';
import { CreateContactDialog } from '../components/contacts/CreateContactDialog.js';
import { useContacts } from '../hooks/useContacts.js';

const columnHelper = createColumnHelper<ContactDTO>();

export function ContactsPage() {
  const { data: contacts, isLoading } = useContacts();

  const columns = [
    columnHelper.accessor('name', { header: 'Contacto' }),
    columnHelper.accessor('companyName', { header: 'Empresa' }),
    columnHelper.accessor('position', { header: 'Cargo', cell: (info) => info.getValue() ?? '—' }),
    columnHelper.accessor('email', { header: 'Correo', cell: (info) => info.getValue() ?? '—' }),
    columnHelper.accessor('phone', { header: 'Teléfono', cell: (info) => info.getValue() ?? '—' }),
  ];

  const table = useReactTable({ data: contacts ?? [], columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Contactos</h1>
        <CreateContactDialog />
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
