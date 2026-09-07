import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import type { UserDTO } from '@ventry/shared';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { CreateVendedorDialog } from '../components/team/CreateVendedorDialog.js';
import { useUsers, useSetUserStatus, useUpdateUser } from '../hooks/useUsers.js';
import { EditDialog } from '../components/EditDialog.js';
import { updateUserSchema } from '@ventry/shared';

const columnHelper = createColumnHelper<UserDTO>();

export function TeamPage() {
  const { data: users, isLoading } = useUsers();
  const setStatus = useSetUserStatus();
  const updateUser = useUpdateUser();

  const columns = [
    columnHelper.accessor((row) => `${row.firstName} ${row.lastName}`, {
      id: 'name',
      header: 'Vendedor',
    }),
    columnHelper.accessor('email', { header: 'Correo' }),
    columnHelper.accessor('status', {
      header: 'Estado',
      cell: (info) => <Badge tone={info.getValue() === 'ACTIVE' ? 'success' : 'neutral'}>{info.getValue() === 'ACTIVE' ? 'Activo' : 'Inactivo'}</Badge>,
    }),
    columnHelper.accessor('commissionPct', {
      header: 'Comisión',
      cell: (info) => `${info.getValue()}%`,
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
        <EditDialog
          title="Editar vendedor"
          schema={updateUserSchema}
          isPending={updateUser.isPending}
          isError={updateUser.isError}
          values={{
            firstName: row.original.firstName,
            lastName: row.original.lastName,
            phone: row.original.phone ?? '',
            commissionPct: row.original.commissionPct,
          }}
          fields={[
            { key: 'firstName', label: 'Nombre' },
            { key: 'lastName', label: 'Apellido' },
            { key: 'phone', label: 'Teléfono' },
            { key: 'commissionPct', label: 'Comisión (%)' },
          ]}
          onSubmit={(data, close) =>
            updateUser.mutate(
              // El input devuelve texto; commissionPct es numérico en el schema.
              { id: row.original.id, ...data, commissionPct: Number(data.commissionPct) },
              { onSuccess: close }
            )
          }
        />
        <Button
          variant="outline"
          size="sm"
          disabled={setStatus.isPending && setStatus.variables?.id === row.original.id}
          onClick={() =>
            setStatus.mutate({ id: row.original.id, status: row.original.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
          }
        >
          {row.original.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
        </Button>
        </div>
      ),
    }),
  ];

  const table = useReactTable({ data: users ?? [], columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Vendedores</h1>
        <CreateVendedorDialog />
      </div>
      {setStatus.isError && (
        <p className="mb-4 text-sm text-red-600">No se pudo actualizar el estado del vendedor. Intenta de nuevo.</p>
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
