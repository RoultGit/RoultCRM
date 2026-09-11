import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../lib/api.js';
import { useQuotes, usePublicQuote, useRespondQuote } from './useQuotes.js';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('cotizaciones', () => {
  it('pide la lista con los filtros puestos', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [{ id: '1', number: 1 }] });
    const { result } = renderHook(() => useQuotes({ status: 'SENT' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith('/quotes', { params: { status: 'SENT' } });
  });

  it('los filtros entran en la llave de caché', async () => {
    // Con una llave fija, la lista filtrada pisaría a la completa y la pantalla mostraría lo que no
    // pidió.
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [] });
    const client = new QueryClient();
    const conCliente = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useQuotes({ status: 'ACCEPTED' }), { wrapper: conCliente });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const llaves = client.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey));
    expect(llaves.some((k) => k.includes('ACCEPTED'))).toBe(true);
  });

  it('la vista pública no pide sesión y no reintenta si el token no existe', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('404'));
    const { result } = renderHook(() => usePublicQuote('token-inventado'), { wrapper });
    // Sin retry:false, un link mal pegado reintenta varias veces antes de decir que no existe.
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('no pide nada si no hay token en la URL', () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: {} });
    renderHook(() => usePublicQuote(undefined), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });

  it('responder manda lo que el cliente eligió', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { status: 'ACCEPTED' } });
    const { result } = renderHook(() => useRespondQuote('abc'), { wrapper });
    result.current.mutate({ accept: true, respondedBy: 'Rosa Delgado' });
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/quotes/public/abc/respond', {
      accept: true,
      respondedBy: 'Rosa Delgado',
    });
  });
});
