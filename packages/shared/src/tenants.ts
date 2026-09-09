import { z } from 'zod';

// Dar de alta una empresa cliente: la entidad y su primer administrador, en un solo paso. Sin ese
// primer admin la entidad nace inaccesible — nadie podría entrar a crear a los demás.
export const createTenantSchema = z.object({
  name: z.string().min(1, 'Ingresa el nombre de la empresa'),
  adminEmail: z.string().email('Ingresa un correo válido'),
  adminFirstName: z.string().min(1, 'Ingresa el nombre'),
  adminLastName: z.string().min(1, 'Ingresa el apellido'),
});

export interface TenantDTO {
  id: string;
  name: string;
  createdAt: string;
  userCount: number;
}

export interface CreatedTenantDTO {
  tenant: TenantDTO;
  adminEmail: string;
  // La contraseña generada viaja UNA sola vez, en la respuesta del alta, y no se guarda en claro en
  // ningún lado. Si se pierde, no se recupera: se cambia.
  temporaryPassword: string;
}
