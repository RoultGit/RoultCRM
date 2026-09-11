import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../lib/api.js';
import { useInstallments, useReceivableTotals, usePayInstallment } from './useInstallments.js';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('cobranza', () => {
  it('filtra por estado', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [] });
    const { result } = renderHook(() => useInstallments({ status: 'overdue' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith('/installments', { params: { status: 'overdue' } });
  });

  it('los totales vienen separados por moneda', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { pending: { PEN: 4000, USD: 500 }, overdue: {}, paid: { PEN: 4000 } },
    });
    const { result } = renderHook(() => useReceivableTotals(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Sumar soles con dólares no es un total, es un error con formato de moneda.
    expect(result.current.data?.pending).toEqual({ PEN: 4000, USD: 500 });
  });

  it('registrar un cobro manda el método y el monto', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} });
    const { result } = renderHook(() => usePayInstallment(), { wrapper });
    result.current.mutate({ id: 'c1', method: 'Yape / Plin', paidAmount: 4250 });
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/installments/c1/pay', {
      method: 'Yape / Plin',
      paidAmount: 4250,
    });
  });
});
