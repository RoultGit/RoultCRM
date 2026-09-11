import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CustomFieldDTO } from '@roult/shared';
import { apiClient } from '../lib/api.js';

type RelatedType = CustomFieldDTO['entity'];

export interface AttachmentDTO {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  uploadedById: string;
  createdAt: string;
  downloadUrl: string | null;
}

export function useAttachments(relatedType: RelatedType, relatedId: string | undefined) {
  return useQuery({
    queryKey: ['attachments', relatedType, relatedId],
    queryFn: async () =>
      (await apiClient.get<AttachmentDTO[]>('/attachments', { params: { relatedType, relatedId } })).data,
    enabled: !!relatedId,
  });
}

/**
 * Sube en tres pasos: se pide permiso, el navegador manda el archivo DIRECTO al almacenamiento, y
 * recién ahí se confirma.
 *
 * El archivo no pasa por la API a propósito: por ahí el límite del cuerpo de una función serverless
 * sería el techo del tamaño, y cada subida ocuparía el servidor todo lo que dure.
 */
export function useUploadAttachment(relatedType: RelatedType, relatedId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const { data: permiso } = await apiClient.post<{ id: string; uploadUrl: string; token: string }>(
        '/attachments/upload-url',
        { relatedType, relatedId, name: file.name, size: file.size, mimeType: file.type }
      );

      const subida = await fetch(permiso.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, Authorization: `Bearer ${permiso.token}` },
        body: file,
      });
      if (!subida.ok) throw new Error('No se pudo subir el archivo');

      return (await apiClient.post<AttachmentDTO>(`/attachments/${permiso.id}/confirm`)).data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attachments', relatedType, relatedId] }),
  });
}

export function useDeleteAttachment(relatedType: RelatedType, relatedId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/attachments/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attachments', relatedType, relatedId] }),
  });
}
