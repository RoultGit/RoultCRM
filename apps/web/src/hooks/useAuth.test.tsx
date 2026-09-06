import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { apiClient, setAccessToken } from '../lib/api.js';
import { useLogin } from './useAuth.js';

vi.mock('../lib/api.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/api.js')>('../lib/api.js');
  return { ...actual, setAccessToken: vi.fn() };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('useLogin', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stores the access token on success', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { accessToken: 'abc123' } });
    const { result } = renderHook(() => useLogin(), { wrapper });
    result.current.mutate({ email: 'a@test.com', password: 'secret123' });
    await waitFor(() => expect(setAccessToken).toHaveBeenCalledWith('abc123'));
  });
});
