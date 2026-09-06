import type { UserDTO, createUserSchema, updateUserSchema } from '@ventry/shared';
import type { z } from 'zod';
import { UsersRepository } from './users.repository.js';
import { hashPassword } from '../../lib/password.js';
import { NotFoundError } from '../../lib/errors.js';
import type { User } from '@prisma/client';

function toDTO(user: User): UserDTO {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    phone: user.phone,
    commissionPct: Number(user.commissionPct),
    hireDate: user.hireDate.toISOString(),
  };
}

export const UsersService = {
  async list(tenantId: string): Promise<UserDTO[]> {
    const users = await UsersRepository.findManyByTenant(tenantId);
    return users.map(toDTO);
  },

  async create(tenantId: string, input: z.infer<typeof createUserSchema>): Promise<UserDTO> {
    const user = await UsersRepository.create({
      tenantId,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      phone: input.phone,
      commissionPct: input.commissionPct ?? 20,
    });
    return toDTO(user);
  },

  async update(tenantId: string, id: string, input: z.infer<typeof updateUserSchema>): Promise<UserDTO> {
    const existing = await UsersRepository.findByIdAndTenant(id, tenantId);
    if (!existing) throw new NotFoundError('User not found');
    await UsersRepository.updateByIdAndTenant(id, tenantId, input);
    const updated = await UsersRepository.findByIdAndTenant(id, tenantId);
    return toDTO(updated!);
  },

  async setStatus(tenantId: string, id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<UserDTO> {
    const existing = await UsersRepository.findByIdAndTenant(id, tenantId);
    if (!existing) throw new NotFoundError('User not found');
    await UsersRepository.updateStatus(id, tenantId, status);
    const updated = await UsersRepository.findByIdAndTenant(id, tenantId);
    return toDTO(updated!);
  },
};
