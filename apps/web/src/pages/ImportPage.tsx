import { useState } from 'react';
import Papa from 'papaparse';
import type { ImportPreviewDTO, ImportRowResult, ImportableEntity } from '@roult/shared';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { usePreviewImport, useCommitImport } from '../hooks/useImport.js';

const ENTITIES: { value: ImportableEntity; label: string; columns: string }[] = [
  { value: 'companies', label: 'Empresas', columns: 'name, representativeName, line, city, source, whatsapp, email, notes' },
  { value: 'contacts', label: 'Contactos', columns: 'companyId, name, position, phone, whatsapp, email, notes' },
  { value: 'leads', label: 'Leads', columns: 'businessName, contactName, representativeName, line, billingType, phone, whatsapp, email, source, notes' },
];

const STATUS_TONE = { NEW: 'success', DUPLICATE: 'warning', INVALID: 'danger' } as const;
const STATUS_LABEL = { NEW: 'Nueva', DUPLICATE: 'Duplicada', INVALID: 'Inválida' } as const;

export function ImportPage() {
  const [entity, setEntity] = useState<ImportableEntity>('companies');
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [preview, setPreview] = useState<ImportPreviewDTO | null>(null);
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const [created, setCreated] = useState<number | null>(null);

  const previewImport = usePreviewImport();
  const commitImport = useCommitImport();

  const reset = () => {
    setFileName(null);
    setRows([]);
    setPreview(null);
    setKeep(new Set());
    setCreated(null);
  };

  const onFile = (file: File) => {
    setCreated(null);
    setFileName(file.name);
    // Parsear CSV a mano falla justo con los archivos reales que salen de Excel: comas dentro de
    // comillas, comillas escapadas, saltos de línea dentro de una celda. El archivo lo trae el
    // usuario, así que acá sí vale la dependencia.
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const parsed = result.data;
        setRows(parsed);
        previewImport.mutate(
          { entity, rows: parsed },
          {
            onSuccess: (data) => {
              setPreview(data);
              // Lo nuevo arranca marcado y lo duplicado desmarcado: al migrar, lo esperable es no
              // volver a crear lo que ya está. Lo inválido no se puede marcar.
              setKeep(new Set(data.rows.filter((r) => r.status === 'NEW').map((r) => r.index)));
            },
          }
        );
      },
    });
  };

  const toggle = (row: ImportRowResult) => {
    if (row.status === 'INVALID') return;
    setKeep((current) => {
      const next = new Set(current);
      if (next.has(row.index)) next.delete(row.index);
      else next.add(row.index);
      return next;
    });
  };

  const submit = () => {
    if (!preview) return;
    const skipIndexes = preview.rows.filter((r) => !keep.has(r.index)).map((r) => r.index);
    commitImport.mutate(
      { entity, rows, skipIndexes },
      {
        onSuccess: (data) => {
          setCreated(data.created);
          setPreview(null);
          setRows([]);
          setFileName(null);
        },
      }
    );
  };

  const selected = preview?.rows.filter((r) => keep.has(r.index)) ?? [];
  const hasInvalidSelected = selected.some((r) => r.status === 'INVALID');

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Importar desde CSV</h1>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={entity}
            aria-label="Qué importar"
            disabled={!!preview}
            onChange={(e) => {
              setEntity(e.target.value as ImportableEntity);
              reset();
            }}
          >
            {ENTITIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            type="file"
            accept=".csv,text/csv"
            className="text-sm"
            aria-label="Archivo CSV"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          {fileName && (
            <span className="text-sm text-gray-500">
              {fileName}{' '}
              <button type="button" className="underline" onClick={reset}>
                empezar de nuevo
              </button>
            </span>
          )}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Columnas esperadas: {ENTITIES.find((o) => o.value === entity)?.columns}. La primera fila del archivo tiene que
          ser la de encabezados.
        </p>
      </Card>

      {previewImport.isPending && <Card className="p-6 text-sm text-gray-500">Revisando el archivo…</Card>}
      {previewImport.isError && (
        <Card className="p-6 text-sm text-red-600">No se pudo leer el archivo. Revisá que sea un CSV válido.</Card>
      )}
      {created !== null && (
        <Card className="p-6 text-sm text-green-700">Se importaron {created} registros.</Card>
      )}

      {preview && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-gray-600">
            <span>
              {preview.summary.new} nuevas · {preview.summary.duplicate} duplicadas · {preview.summary.invalid} inválidas
            </span>
            <Button
              className="ml-auto"
              disabled={selected.length === 0 || hasInvalidSelected || commitImport.isPending}
              onClick={submit}
            >
              {commitImport.isPending ? 'Importando…' : `Importar ${selected.length} filas`}
            </Button>
          </div>
          {commitImport.isError && (
            <p className="mb-3 text-sm text-red-600">
              No se importó nada. Revisá las filas marcadas: si una sola falla, no entra ninguna.
            </p>
          )}
          <Card className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  {['', 'Fila', 'Estado', 'Detalle', 'Contenido'].map((header) => (
                    <th key={header} className="px-4 py-3 font-medium text-gray-600">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.index} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={keep.has(row.index)}
                        disabled={row.status === 'INVALID'}
                        aria-label={`Importar la fila ${row.index + 1}`}
                        onChange={() => toggle(row)}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{row.index + 1}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{row.message ?? '—'}</td>
                    <td className="max-w-md truncate px-4 py-3 text-gray-600">
                      {Object.values(row.data).filter(Boolean).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
