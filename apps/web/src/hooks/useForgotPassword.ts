import { useMutation } from '@tanstack/react-query';
import axios from 'axios';

// axios crudo y no apiClient: estas dos rutas son públicas y el interceptor de apiClient, ante un
// 401, intenta renovar la sesión — justo lo que no existe cuando alguien olvidó su contraseña.
const client = axios.create({ baseURL: import.meta.env.VITE_API_URL });

export function useForgotPassword() {
  return useMutation({
    mutationFn: async (email: string) => (await client.post('/auth/forgot-password', { email })).data,
  });
}

export function useResetWithToken() {
  return useMutation({
    mutationFn: async (input: { token: string; newPassword: string }) =>
      (await client.post('/auth/reset-password', input)).data,
  });
}
