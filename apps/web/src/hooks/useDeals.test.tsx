import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../lib/api.js';
import { useDeals, useSetDealStage } from './useDeals.js';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useDeals', () => {
  it('fetches the deal list', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [{ id: '1', title: 'Web corporativa', stage: 'CONTACTO' }],
    });
    const { result } = renderHook(() => useDeals(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });

  // El update optimista tiene que llegar a la lista que la página está mostrando, que se cachea bajo
  // ['deals', filtros] y no bajo ['deals']. Escribiendo en la key sin filtros el cambio de columna
  // no se veía hasta que respondía el servidor, y el arrastre parecía trabado.
  it('moves the card in the cached list before the server answers', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [{ id: '1', title: 'Web corporativa', stage: 'CONTACTO' }],
    });
    // Nunca resuelve: si la card se mueve igual, se movió por el update optimista.
    vi.spyOn(apiClient, 'patch').mockReturnValue(new Promise(() => {}) as never);

    const client = new QueryClient();
    const withClient = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const filters = { stage: 'CONTACTO' };
    const { result } = renderHook(
      () => ({ list: useDeals(filters), setStage: useSetDealStage() }),
      { wrapper: withClient }
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    result.current.setStage.mutate({ id: '1', stage: 'PROPUESTA' });
    await waitFor(() => expect(result.current.list.data?.[0].stage).toBe('PROPUESTA'));
  });
});
