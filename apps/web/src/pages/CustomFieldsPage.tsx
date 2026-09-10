import { useState } from 'react';
import { Archive, ArchiveRestore, Plus, X } from 'lucide-react';
import {
  CUSTOM_FIELD_ENTITIES,
  FIELD_TYPE_LABEL,
  FIELD_TYPE_OPTIONS,
  type CustomFieldDTO,
  type CustomFieldType,
} from '@roult/shared';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { useCustomFields, useCreateCustomField, useUpdateCustomField } from '../hooks/useCustomFields.js';
import { apiClient } from '../lib/api.js';
import { useQuery } from '@tanstack/react-query';

type Entity = (typeof CUSTOM_FIELD_ENTITIES)[number]['value'];

// Los archivados no vienen en el listado normal —esa es la idea de archivarlos— así que para poder
// reactivarlos hay que pedirlos aparte.
function useArchived(entity: Entity) {
  return useQuery({
    queryKey: ['custom-fields', 'archived', entity],
    queryFn: async () => {
      const all = (await apiClient.get<CustomFieldDTO[]>('/custom-fields', { params: { entity } })).data;
      return all.filter((f) => f.archivedAt);
    },
  });
}

export function CustomFieldsPage() {
  const [entity, setEntity] = useState<Entity>('COMPANY');
  const { data: fields, isLoading } = useCustomFields(entity);
  const create = useCreateCustomField();
  const update = useUpdateCustomField();

  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomFieldType>('TEXT');
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [optionDraft, setOptionDraft] = useState('');

  const reset = () => { setLabel(''); setType('TEXT'); setRequired(false); setOptions([]); setOptionDraft(''); };
  const puedeCrear = label.trim() && (type !== 'SELECT' || options.length > 0) && !create.isPending;

  const input = 'rounded-lg border border-gray-200 px-3 py-2 text-sm';

  return (
    <div>
      <h1 className="text-xl font-semibold">Campos propios</h1>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        Datos que solo tu empresa necesita y que el CRM no trae de fábrica. Aparecen en la ficha, abajo
        de los datos normales.
      </p>

      {/* Los campos son por tipo de ficha: el RUC va en la empresa, el número de orden en la venta. */}
      <div className="mb-4 inline-flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5">
        {CUSTOM_FIELD_ENTITIES.map((option) => (
          <button
            key={option.value}
            onClick={() => setEntity(option.value)}
            aria-pressed={entity === option.value}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              entity === option.value ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
            En {CUSTOM_FIELD_ENTITIES.find((e) => e.value === entity)?.label.toLowerCase()}
          </h2>
          {isLoading ? (
            <p className="text-sm text-gray-400">Cargando…</p>
          ) : (fields ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">
              Todavía no hay campos propios acá. Creá el primero con el formulario de al lado.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {(fields ?? []).map((field) => (
                <li key={field.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {field.label}
                      {field.required && <span className="ml-1 text-red-500">*</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {FIELD_TYPE_LABEL[field.type]}
                      {field.options.length > 0 && ` · ${field.options.join(', ')}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900"
                    aria-label={`Archivar ${field.label}`}
                    title="Archivar (los datos ya cargados se conservan)"
                    onClick={() => update.mutate({ id: field.id, archived: true })}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <ArchivedList entity={entity} onRestore={(id) => update.mutate({ id, archived: false })} />
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">Campo nuevo</h2>
          <div className="space-y-3">
            <input
              className={`${input} w-full`}
              placeholder="Nombre. Ej. RUC, Metros cuadrados"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <select className={`${input} w-full`} value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>
              {FIELD_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {type === 'SELECT' && (
              <div>
                <div className="flex gap-2">
                  <input
                    className={`${input} min-w-0 flex-1`}
                    placeholder="Agregar opción"
                    value={optionDraft}
                    onChange={(e) => setOptionDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' || !optionDraft.trim()) return;
                      e.preventDefault();
                      setOptions((prev) => [...prev, optionDraft.trim()]);
                      setOptionDraft('');
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!optionDraft.trim()}
                    onClick={() => { setOptions((prev) => [...prev, optionDraft.trim()]); setOptionDraft(''); }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {options.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {options.map((option, i) => (
                      <span key={`${option}-${i}`} className="flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs">
                        {option}
                        <button
                          type="button"
                          aria-label={`Quitar ${option}`}
                          onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-gray-400 hover:text-gray-900"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {options.length === 0 && (
                  <p className="mt-2 text-xs text-amber-700">
                    Una lista sin opciones no deja elegir nada.
                  </p>
                )}
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
              Marcarlo como obligatorio
            </label>

            {create.isError && <p className="text-xs text-red-600">No se pudo crear el campo.</p>}
            <Button
              className="w-full"
              disabled={!puedeCrear}
              onClick={() =>
                create.mutate(
                  { entity, label: label.trim(), type, options, required },
                  { onSuccess: reset }
                )
              }
            >
              {create.isPending ? 'Creando…' : 'Crear campo'}
            </Button>
            <p className="text-xs text-gray-500">
              El tipo no se puede cambiar después: si un campo de texto pasara a número, los datos ya
              cargados dejarían de ser válidos.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ArchivedList({ entity, onRestore }: { entity: Entity; onRestore: (id: string) => void }) {
  const { data } = useArchived(entity);
  if (!data || data.length === 0) return null;
  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <p className="mb-2 text-xs text-gray-500">Archivados</p>
      <ul className="space-y-2">
        {data.map((field) => (
          <li key={field.id} className="flex items-center gap-2">
            <Badge tone="neutral">{field.label}</Badge>
            <span className="text-xs text-gray-400">{FIELD_TYPE_LABEL[field.type]}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto px-2 text-gray-400 hover:text-gray-900"
              aria-label={`Reactivar ${field.label}`}
              title="Reactivar"
              onClick={() => onRestore(field.id)}
            >
              <ArchiveRestore className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
