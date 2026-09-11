import { randomUUID } from 'node:crypto';
import type { RelatedType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { ownerFilter, type Actor } from '../../lib/scope.js';
import { signUpload, signDownload, removeObject, statObject, isStorageConfigured } from '../../lib/storage.js';

/** 20 MB. Un contrato escaneado entra de sobra; un video no, y no es lo que va en un CRM. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Lo que se deja subir.
 *
 * Lista blanca y no lista negra: con una negra, cualquier tipo nuevo entra por defecto. Esto se
 * descarga después desde el navegador de otra persona, así que nada ejecutable.
 */
export const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]);

export interface AttachmentDTO {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  uploadedById: string;
  createdAt: string;
  /** Vence en minutos: no es un link para pegar en un chat. */
  downloadUrl: string | null;
}

/**
 * ¿Puede este actor ver la ficha a la que se le cuelga el archivo?
 *
 * Mismo criterio que las interacciones y los campos propios: relatedId es un id suelto sin clave
 * foránea, así que sin preguntar por la ficha real cualquiera con un id podría subir —y leer—
 * archivos en el cliente de otra empresa.
 */
async function assertCanSee(actor: Actor, relatedType: RelatedType, relatedId: string): Promise<void> {
  const { tenantId } = actor;
  const owner = ownerFilter(actor);
  const found = await (async () => {
    switch (relatedType) {
      case 'COMPANY':
        return prisma.company.findFirst({ where: { id: relatedId, tenantId, ...owner }, select: { id: true } });
      case 'LEAD':
        return prisma.lead.findFirst({ where: { id: relatedId, tenantId, ...owner }, select: { id: true } });
      case 'DEAL':
        return prisma.deal.findFirst({ where: { id: relatedId, tenantId, ...owner }, select: { id: true } });
      case 'CONTACT':
        return prisma.contact.findFirst({
          where: { id: relatedId, tenantId, company: { ...owner } },
          select: { id: true },
        });
    }
  })();
  if (!found) throw new NotFoundError('Record not found');
}

/** El nombre que ve la persona se guarda aparte; en el bucket el archivo se llama por su id. */
function limpiarNombre(nombre: string): string {
  return nombre.replace(/[\r\n\t]/g, ' ').trim().slice(0, 200) || 'archivo';
}

export const AttachmentsService = {
  async list(actor: Actor, relatedType: RelatedType, relatedId: string): Promise<AttachmentDTO[]> {
    await assertCanSee(actor, relatedType, relatedId);
    const filas = await prisma.attachment.findMany({
      // Solo los que terminaron de subir: una fila sin uploadedAt es una subida que se cortó.
      where: { tenantId: actor.tenantId, relatedType, relatedId, uploadedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      filas.map(async (fila) => ({
        id: fila.id,
        name: fila.name,
        size: fila.size,
        mimeType: fila.mimeType,
        uploadedById: fila.uploadedById,
        createdAt: fila.createdAt.toISOString(),
        downloadUrl: await signDownload(fila.path, 300, fila.name),
      }))
    );
  },

  /** Paso 1: se reserva el lugar y se devuelve una URL para que el navegador suba directo. */
  async requestUpload(
    actor: Actor,
    input: { relatedType: RelatedType; relatedId: string; name: string; size: number; mimeType: string }
  ): Promise<{ id: string; uploadUrl: string; token: string }> {
    await assertCanSee(actor, input.relatedType, input.relatedId);

    if (!isStorageConfigured()) {
      throw new ValidationError('El almacenamiento de archivos no está configurado en el servidor.');
    }
    if (input.size <= 0 || input.size > MAX_FILE_BYTES) {
      throw new ValidationError(`El archivo no puede pesar más de ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
    }
    if (!ALLOWED_MIME.has(input.mimeType)) {
      throw new ValidationError('Ese tipo de archivo no se puede subir.');
    }

    const id = randomUUID();
    // El tenantId va adelante en la ruta: un archivo nunca puede quedar servido desde la carpeta de
    // otra empresa, ni siquiera si alguien se equivoca armando la ruta más adelante.
    const path = `${actor.tenantId}/${input.relatedType.toLowerCase()}/${input.relatedId}/${id}`;
    const firmada = await signUpload(path);
    if (!firmada) throw new ValidationError('No se pudo preparar la subida. Probá de nuevo.');

    await prisma.attachment.create({
      data: {
        id,
        tenantId: actor.tenantId,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        name: limpiarNombre(input.name),
        size: input.size,
        mimeType: input.mimeType,
        path,
        uploadedById: actor.userId,
      },
    });
    return { id, uploadUrl: firmada.url, token: firmada.token };
  },

  /**
   * Paso 2: se confirma contra el almacenamiento que el archivo llegó.
   *
   * No se cree lo que dice el navegador: se pregunta por el objeto. Si no está, la fila se borra en
   * vez de quedar como un adjunto que no se puede abrir.
   */
  async confirmUpload(actor: Actor, id: string): Promise<AttachmentDTO> {
    const fila = await prisma.attachment.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!fila) throw new NotFoundError('Attachment not found');
    await assertCanSee(actor, fila.relatedType, fila.relatedId);

    const objeto = await statObject(fila.path);
    if (!objeto) {
      await prisma.attachment.delete({ where: { id } });
      throw new ValidationError('La subida no se completó. Probá de nuevo.');
    }

    const actualizado = await prisma.attachment.update({
      where: { id },
      // El tamaño real gana al declarado: el que el navegador mandó al pedir la URL es un dato sin
      // verificar, y con él se podría reportar 1 KB y subir 20 MB.
      data: { uploadedAt: new Date(), size: objeto.size },
    });
    return {
      id: actualizado.id,
      name: actualizado.name,
      size: actualizado.size,
      mimeType: actualizado.mimeType,
      uploadedById: actualizado.uploadedById,
      createdAt: actualizado.createdAt.toISOString(),
      downloadUrl: await signDownload(actualizado.path, 300, actualizado.name),
    };
  },

  async remove(actor: Actor, id: string): Promise<void> {
    const fila = await prisma.attachment.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!fila) throw new NotFoundError('Attachment not found');
    await assertCanSee(actor, fila.relatedType, fila.relatedId);

    // Primero el objeto y después la fila: al revés, un fallo al borrar el archivo dejaría bytes
    // pagados en el bucket que ya nadie puede encontrar ni borrar.
    await removeObject(fila.path);
    await prisma.attachment.delete({ where: { id } });
  },
};
