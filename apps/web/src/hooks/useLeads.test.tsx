import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../lib/api.js';
import { useLeads } from './useLeads.js';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useLeads', () => {
  it('fetches the lead list', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [{ id: '1', businessName: 'ABC SAC', status: 'NEW' }] });
    const { result } = renderHook(() => useLeads(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});
