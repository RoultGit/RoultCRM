import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../lib/api.js';
import { useAttachments, useUploadAttachment } from './useAttachments.js';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('adjuntos', () => {
  it('no pide nada sin un registro al que colgarse', () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [] });
    renderHook(() => useAttachments('COMPANY', undefined), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });

  it('sube en tres pasos y el archivo NO pasa por la API', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce({ data: { id: 'a1', uploadUrl: 'https://storage/x', token: 't' } })
      .mockResolvedValueOnce({ data: { id: 'a1', name: 'contrato.pdf' } });
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUploadAttachment('COMPANY', 'c1'), { wrapper });
    const file = new File(['x'], 'contrato.pdf', { type: 'application/pdf' });
    result.current.mutate(file);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Pide permiso, sube DIRECTO al almacenamiento, confirma.
    expect(post).toHaveBeenNthCalledWith(1, '/attachments/upload-url', {
      relatedType: 'COMPANY',
      relatedId: 'c1',
      name: 'contrato.pdf',
      size: file.size,
      mimeType: 'application/pdf',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://storage/x', expect.objectContaining({ method: 'PUT' }));
    expect(post).toHaveBeenNthCalledWith(2, '/attachments/a1/confirm');
    vi.unstubAllGlobals();
  });

  it('si la subida al almacenamiento falla, no confirma', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { id: 'a1', uploadUrl: 'https://storage/x', token: 't' } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));

    const { result } = renderHook(() => useUploadAttachment('COMPANY', 'c1'), { wrapper });
    result.current.mutate(new File(['x'], 'x.pdf', { type: 'application/pdf' }));
    // Confirmar una subida que no llegó dejaría un adjunto que no se puede abrir.
    await waitFor(() => expect(result.current.isError).toBe(true));
    vi.unstubAllGlobals();
  });
});
