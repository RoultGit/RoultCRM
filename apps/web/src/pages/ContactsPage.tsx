import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import type { ContactDTO } from '@roult/shared';
import { Card } from '../components/ui/card.js';
import { CreateContactDialog } from '../components/contacts/CreateContactDialog.js';
import { useContacts, useUpdateContact } from '../hooks/useContacts.js';
import { EditDialog } from '../components/EditDialog.js';
import { updateContactSchema } from '@roult/shared';

const columnHelper = createColumnHelper<ContactDTO>();

export function ContactsPage() {
  const { data: contacts, isLoading } = useContacts();
  const updateContact = useUpdateContact();

  const columns = [
    columnHelper.accessor('name', { header: 'Contacto' }),
    columnHelper.accessor('companyName', { header: 'Empresa' }),
    columnHelper.accessor('position', { header: 'Cargo', cell: (info) => info.getValue() ?? '—' }),
    columnHelper.accessor('email', { header: 'Correo', cell: (info) => info.getValue() ?? '—' }),
    columnHelper.accessor('phone', { header: 'Teléfono', cell: (info) => info.getValue() ?? '—' }),
    columnHelper.display({
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <EditDialog
          title="Editar contacto"
          custom={{ entity: 'CONTACT', recordId: row.original.id }}
          schema={updateContactSchema}
          isPending={updateContact.isPending}
          isError={updateContact.isError}
          values={{
            name: row.original.name,
            position: row.original.position ?? '',
            email: row.original.email ?? '',
            phone: row.original.phone ?? '',
            whatsapp: row.original.whatsapp ?? '',
            notes: row.original.notes ?? '',
          }}
          fields={[
            { key: 'name', label: 'Nombre' },
            { key: 'position', label: 'Cargo' },
            { key: 'email', label: 'Correo', type: 'email' },
            { key: 'phone', label: 'Teléfono' },
            { key: 'whatsapp', label: 'WhatsApp' },
            { key: 'notes', label: 'Notas', type: 'textarea' },
          ]}
          onSubmit={(data, close) => updateContact.mutate({ id: row.original.id, ...data }, { onSuccess: close })}
        />
      ),
    }),
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
