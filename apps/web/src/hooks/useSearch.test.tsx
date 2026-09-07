import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../lib/api.js';
import { useSearch } from './useSearch.js';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSearch', () => {
  it('does not hit the API for a blank query', async () => {
    const get = vi.spyOn(apiClient, 'get');
    renderHook(() => useSearch('  '), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(get).not.toHaveBeenCalled();
  });

  it('returns the results for a real query', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { results: [{ type: 'COMPANY', id: '1', label: 'ABC SAC', sublabel: null, href: '/companies' }] },
    });
    const { result } = renderHook(() => useSearch('ABC'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});
