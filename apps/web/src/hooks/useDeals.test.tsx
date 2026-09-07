import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../lib/api.js';
import { useDeals } from './useDeals.js';

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
});
