import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
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

export const setUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export interface UserDTO {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'VENDEDOR';
  status: 'ACTIVE' | 'INACTIVE';
  phone: string | null;
  commissionPct: number;
  hireDate: string;
}
