import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { UserDTO } from '@ventry/shared';
import { apiClient, setAccessToken } from '../lib/api.js';

interface LoginInput {
  email: string;
  password: string;
}

export function useLogin() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const res = await apiClient.post<{ accessToken: string }>('/auth/login', input);
      return res.data;
    },
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      navigate('/');
    },
  });
}

// El rol del usuario no viaja al frontend por ningún otro lado: el access token vive en una
// variable de módulo dentro de api.ts y no se expone. Decodificar el JWT acá sería más corto pero
// se rompe justo después de un reload, cuando el token en memoria es null hasta que el primer 401
// dispara el refresh. Esta query pasa por apiClient, así que hereda ese interceptor.
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async () => (await apiClient.get<UserDTO>('/auth/me')).data,
    staleTime: Infinity,
    retry: false,
  });
}
