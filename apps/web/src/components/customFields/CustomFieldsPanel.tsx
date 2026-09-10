import { useState, useEffect } from 'react';
import type { CustomFieldDTO } from '@roult/shared';
import { Button } from '../ui/button.js';
import { Card } from '../ui/card.js';
import { useCustomFields, useCustomValues, useSetCustomValues } from '../../hooks/useCustomFields.js';

type Entity = CustomFieldDTO['entity'];

/**
 * El borrador de los campos propios de un registro.
 *
 * Se guarda todo junto y no campo por campo: quien completa una ficha llena varios de una sentada,
 * y una petición por tecla haría parpadear la pantalla y multiplicaría las escrituras.
 *
 * `recordId` en null apaga las consultas: así el diálogo de edición puede montar el hook siempre y
 * pedir los datos solo cuando está abierto.
 */
export function useCustomFieldsDraft(entity: Entity | undefined, recordId: string | null) {
  const { data: fields } = useCustomFields(entity, !!entity);
  const { data: saved } = useCustomValues(entity ?? 'COMPANY', entity ? recordId : null);
  const mutation = useSetCustomValues(entity ?? 'COMPANY', recordId);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  // Se rehidrata cuando llegan los valores o cambia el registro. Sin la guarda de `dirty`, un
  // refetch en segundo plano pisaría lo que la persona está escribiendo.
  useEffect(() => {
    if (saved && !dirty) setDraft(saved.values);
  }, [saved, recordId]);
  useEffect(() => setDirty(false), [recordId]);

  return {
    fields: fields ?? [],
    draft,
    dirty,
    isPending: mutation.isPending,
    isError: mutation.isError,
    set: (id: string, value: string) => {
      setDirty(true);
      setDraft((prev) => ({ ...prev, [id]: value }));
    },
    discard: () => {
      setDraft(saved?.values ?? {});
      setDirty(false);
    },
    save: async () => {
      if (!dirty || !recordId) return;
      await mutation.mutateAsync(draft);
      setDirty(false);
    },
  };
}

/** Solo los inputs, sin botones: quien los usa decide cuándo se guarda. */
export function CustomFieldInputs({
  fields,
  draft,
  onChange,
}: {
  fields: CustomFieldDTO[];
  draft: Record<string, string>;
  onChange: (id: string, value: string) => void;
}) {
  const input = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm';
  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const value = draft[field.id] ?? '';
        return (
          <label key={field.id} className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">
              {field.label}
              {field.required && <span className="ml-1 text-red-500">*</span>}
            </span>
            {field.type === 'SELECT' ? (
              <select className={input} value={value} onChange={(e) => onChange(field.id, e.target.value)}>
                <option value="">Sin definir</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : field.type === 'CHECKBOX' ? (
              <button
                type="button"
                onClick={() => onChange(field.id, value === 'true' ? 'false' : 'true')}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  value === 'true'
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                {value === 'true' ? 'Sí' : 'No'}
              </button>
            ) : (
              <input
                className={input}
                // El tipo del navegador sale del tipo del campo: así el teclado del teléfono y el
                // selector de fecha son los correctos sin escribir nada más.
                type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
                value={value}
                onChange={(e) => onChange(field.id, e.target.value)}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

/** Los campos propios en la ficha, con su propio guardado. */
export function CustomFieldsPanel({
  entity,
  recordId,
  title = 'Datos propios',
  card = false,
}: {
  entity: Entity;
  recordId: string;
  title?: string;
  /** Envuelto en tarjeta para las fichas; suelto cuando ya va dentro de otro contenedor. */
  card?: boolean;
}) {
  const custom = useCustomFieldsDraft(entity, recordId);
  if (custom.fields.length === 0) return null;

  const Wrapper = card ? Card : 'div';

  return (
    <Wrapper className={card ? 'p-5' : undefined}>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">{title}</h2>
      <CustomFieldInputs fields={custom.fields} draft={custom.draft} onChange={custom.set} />

      {custom.isError && <p className="mt-2 text-xs text-red-600">No se pudo guardar. Revisá los valores.</p>}
      {/* El botón solo aparece si hay algo sin guardar: presente siempre, invita a apretarlo sin
          motivo y deja la duda de si se guardó o no. */}
      {custom.dirty && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" disabled={custom.isPending} onClick={() => void custom.save()}>
            {custom.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          <button type="button" className="text-xs text-gray-500 hover:text-gray-900" onClick={custom.discard}>
            Descartar
          </button>
        </div>
      )}
    </Wrapper>
  );
}
