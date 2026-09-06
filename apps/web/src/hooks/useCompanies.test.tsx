import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../lib/api.js';
import { useCompanies } from './useCompanies.js';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCompanies', () => {
  it('fetches the company list', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [{ id: '1', name: 'ABC SAC' }] });
    const { result } = renderHook(() => useCompanies(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});
