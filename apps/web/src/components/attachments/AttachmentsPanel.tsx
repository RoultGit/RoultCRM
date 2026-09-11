import { useRef } from 'react';
import { Download, FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import type { CustomFieldDTO } from '@roult/shared';
import { Card } from '../ui/card.js';
import { Button } from '../ui/button.js';
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '../../hooks/useAttachments.js';
import { formatDate } from '../../lib/date.js';

type RelatedType = CustomFieldDTO['entity'];

/** KB o MB según corresponda. "1258291 bytes" no le dice nada a nadie. */
function peso(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Los archivos de una ficha: el contrato firmado, la orden de compra, la foto del local.
 *
 * La descarga va por un link que vence en minutos, no por una dirección fija: la de un contrato
 * firmado no puede quedar accesible para siempre a quien la haya visto una vez.
 */
export function AttachmentsPanel({
  relatedType,
  relatedId,
  card = false,
}: {
  relatedType: RelatedType;
  relatedId: string;
  card?: boolean;
}) {
  const { data: archivos } = useAttachments(relatedType, relatedId);
  const subir = useUploadAttachment(relatedType, relatedId);
  const borrar = useDeleteAttachment(relatedType, relatedId);
  const input = useRef<HTMLInputElement>(null);

  const error = (subir.error as { response?: { data?: { error?: string } } } | null)?.response?.data?.error;
  const Wrapper = card ? Card : 'div';

  return (
    <Wrapper className={card ? 'p-5' : undefined}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
          <Paperclip className="h-3.5 w-3.5" /> Archivos {archivos?.length ? `(${archivos.length})` : ''}
        </h2>
        <Button variant="outline" size="sm" disabled={subir.isPending} onClick={() => input.current?.click()}>
          <Upload className="mr-1 h-3.5 w-3.5" />
          {subir.isPending ? 'Subiendo…' : 'Subir'}
        </Button>
        <input
          ref={input}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.txt,.csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) subir.mutate(file);
            e.target.value = '';
          }}
        />
      </div>

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      {subir.isError && !error && (
        <p className="mb-2 text-xs text-red-600">No se pudo subir el archivo. Probá de nuevo.</p>
      )}

      {!archivos || archivos.length === 0 ? (
        <p className="text-sm text-gray-400">
          Todavía no hay archivos. Subí el contrato, la orden de compra o lo que haga falta tener a mano.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {archivos.map((archivo) => (
            <li key={archivo.id} className="flex items-center gap-3 py-2.5">
              <FileText className="h-4 w-4 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-900">{archivo.name}</p>
                <p className="text-xs text-gray-500">
                  {peso(archivo.size)} · {formatDate(archivo.createdAt)}
                </p>
              </div>
              {archivo.downloadUrl && (
                <a
                  href={archivo.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Descargar ${archivo.name}`}
                  aria-label={`Descargar ${archivo.name}`}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-gray-600 transition-colors hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" />
                </a>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="px-2 text-gray-400 hover:text-red-600"
                aria-label={`Borrar ${archivo.name}`}
                disabled={borrar.isPending}
                onClick={() => borrar.mutate(archivo.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Wrapper>
  );
}
