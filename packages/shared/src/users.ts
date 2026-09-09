import { z } from 'zod';
import { optionalText } from './common.js';

export const createUserSchema = z.object({
  email: z.string().email(),
  // 12 y no 8: la longitud es lo que más pesa contra fuerza bruta, y esto guarda datos de
  // clientes de otras empresas.
  password: z.string().min(12, 'La contraseña debe tener al menos 12 caracteres'),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['ADMIN', 'VENDEDOR']),
  phone: z.string().optional(),
  commissionPct: z.number().min(0).max(100).optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  commissionPct: z.number().min(0).max(100).optional(),
});

export const userFiltersSchema = z.object({
  status: optionalText(z.enum(['ACTIVE', 'INACTIVE'])),
});

// Cambiar la propia contraseña. Pide la actual a propósito: si alcanzara con estar logueado, una
// sesión robada (una laptop abierta, una cookie afanada) podría dejar afuera al dueño de la cuenta.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Ingresa tu contraseña actual'),
    newPassword: z.string().min(12, 'La contraseña nueva debe tener al menos 12 caracteres'),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'La contraseña nueva tiene que ser distinta de la actual',
    path: ['newPassword'],
  });

export interface ResetPasswordDTO {
  userId: string;
  email: string;
  // Viaja una sola vez, igual que al crear una entidad. No se guarda en claro en ningún lado.
  temporaryPassword: string;
}

export const setUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export interface UserDTO {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'VENDEDOR';
  isPlatformOwner: boolean;
  mustChangePassword: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  phone: string | null;
  commissionPct: number;
  hireDate: string;
}
