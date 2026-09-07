import { useUsers } from '../hooks/useUsers.js';
import { apiClient } from '../lib/api.js';

export interface FilterField {
  key: string;
  label: string;
  /** `vendedores` se llena solo con la lista de usuarios del tenant. */
  options: { value: string; label: string }[] | 'vendedores';
}

export type FilterValue = Record<string, string | undefined>;

export function FilterBar({
  fields,
  value,
  onChange,
  exportPath,
  exportName,
}: {
  fields: FilterField[];
  value: FilterValue;
  onChange: (next: FilterValue) => void;
  /** Ruta de exportación, ej. `/deals/export`. Si no viene, no se muestra el botón. */
  exportPath?: string;
  exportName?: string;
}) {
  const { data: users } = useUsers();
  const active = Object.values(value).some(Boolean);

  // La descarga no puede ser un <a href> pelado: la ruta necesita el header Authorization, que un
  // enlace no manda. Se baja con el apiClient (que además renueva el token si hace falta) y se
  // entrega como blob.
  const exportCsv = async () => {
    if (!exportPath) return;
    const res = await apiClient.get(exportPath, { params: value, responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${exportName ?? 'export'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {fields.map((field) => {
        const options =
          field.options === 'vendedores'
            ? (users ?? []).map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))
            : field.options;
        return (
          <select
            key={field.key}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            value={value[field.key] ?? ''}
            aria-label={field.label}
            onChange={(e) => onChange({ ...value, [field.key]: e.target.value || undefined })}
          >
            <option value="">{field.label}: todos</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      })}
      {active && (
        <button type="button" className="text-sm text-gray-500 underline" onClick={() => onChange({})}>
          Limpiar filtros
        </button>
      )}
      {exportPath && (
        <button
          type="button"
          className="ml-auto rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          onClick={exportCsv}
        >
          Exportar CSV
        </button>
      )}
    </div>
  );
}
