import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ResetPasswordDTO, changePasswordSchema } from '@roult/shared';
import type { z } from 'zod';
import { apiClient, setAccessToken } from '../lib/api.js';

// Cambiar la contraseña corta TODAS las sesiones, incluida la que hizo el cambio. El servidor
// devuelve un token nuevo y hay que guardarlo en el acto: sin esto, el usuario queda afuera de la
// app justo después de protegerse, que es el peor momento para echarlo.
export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: z.infer<typeof changePasswordSchema>) =>
      (await apiClient.patch<{ accessToken: string }>('/auth/password', input)).data,
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      // La sesión ahora dice mustChangePassword: false, así que hay que releerla.
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
}

export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) =>
      (await apiClient.post<ResetPasswordDTO>(`/users/${userId}/password/reset`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}
