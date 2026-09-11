import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../lib/api.js';
import { useAutomations, useUpdateAutomation } from './useAutomations.js';

describe('automatizaciones', () => {
  it('trae el catálogo', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [{ code: 'DEAL_STALE', enabled: false, config: { dias: 14 } }],
    });
    const client = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAutomations(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].code).toBe('DEAL_STALE');
  });

  it('el interruptor se pinta antes de que conteste el servidor', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [{ code: 'DEAL_STALE', enabled: false, config: { dias: 14 } }],
    });
    // Nunca resuelve: si el interruptor se mueve igual, se movió por el pintado optimista.
    vi.spyOn(apiClient, 'patch').mockReturnValue(new Promise(() => {}) as never);

    const client = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const lista = renderHook(() => useAutomations(), { wrapper });
    await waitFor(() => expect(lista.result.current.isSuccess).toBe(true));

    const update = renderHook(() => useUpdateAutomation(), { wrapper });
    act(() => update.result.current.mutate({ code: 'DEAL_STALE', enabled: true }));

    // Se mira la caché directo y no el render del otro hook: lo que se prueba es que el pintado
    // optimista escribe en la llave que la pantalla está leyendo, no el tiempo de re-render.
    await waitFor(() => {
      const cacheado = client.getQueryData<{ code: string; enabled: boolean }[]>(['automations']);
      expect(cacheado?.find((a) => a.code === 'DEAL_STALE')?.enabled).toBe(true);
    });
  });
});
