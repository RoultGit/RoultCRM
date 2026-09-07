import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { UsersService } from './users.service.js';
import { NotFoundError } from '../../lib/errors.js';

describe('UsersService', () => {
  let tenantId: string;
  let otherTenantId: string;

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { name: 'Users Test Tenant' } })).id;
    otherTenantId = (await prisma.tenant.create({ data: { name: 'Other Tenant' } })).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  });

  it('creates a VENDEDOR with default 20% commission', async () => {
    const user = await UsersService.create(tenantId, {
      email: 'juan@test.com',
      password: 'secret123456',
      firstName: 'Juan',
      lastName: 'Perez',
      role: 'VENDEDOR',
    });
    expect(user.commissionPct).toBe(20);
    expect(user.status).toBe('ACTIVE');
  });

  it('lists only users from the given tenant', async () => {
    await UsersService.create(tenantId, { email: 'a@test.com', password: 'secret123456', firstName: 'A', lastName: 'A', role: 'VENDEDOR' });
    await UsersService.create(otherTenantId, { email: 'b@test.com', password: 'secret123456', firstName: 'B', lastName: 'B', role: 'VENDEDOR' });
    const list = await UsersService.list(tenantId);
    expect(list).toHaveLength(1);
    expect(list[0].email).toBe('a@test.com');
  });

  it('setStatus deactivates a user without deleting it', async () => {
    const user = await UsersService.create(tenantId, { email: 'c@test.com', password: 'secret123456', firstName: 'C', lastName: 'C', role: 'VENDEDOR' });
    const updated = await UsersService.setStatus(tenantId, user.id, 'INACTIVE');
    expect(updated.status).toBe('INACTIVE');
    const stillThere = await UsersService.list(tenantId);
    expect(stillThere.find((u) => u.id === user.id)).toBeDefined();
  });

  it('throws NotFoundError when updating a user from another tenant', async () => {
    const user = await UsersService.create(otherTenantId, { email: 'd@test.com', password: 'secret123456', firstName: 'D', lastName: 'D', role: 'VENDEDOR' });
    await expect(UsersService.setStatus(tenantId, user.id, 'INACTIVE')).rejects.toThrow(NotFoundError);
  });

  it('update changes the given fields', async () => {
    const user = await UsersService.create(tenantId, { email: 'e@test.com', password: 'secret123456', firstName: 'E', lastName: 'E', role: 'VENDEDOR' });
    const updated = await UsersService.update(tenantId, user.id, { firstName: 'Eduardo', phone: '555-1234' });
    expect(updated.firstName).toBe('Eduardo');
    expect(updated.phone).toBe('555-1234');
    const list = await UsersService.list(tenantId);
    const persisted = list.find((u) => u.id === user.id);
    expect(persisted?.firstName).toBe('Eduardo');
    expect(persisted?.phone).toBe('555-1234');
  });

  it('throws NotFoundError when calling update() on a user from another tenant', async () => {
    const user = await UsersService.create(otherTenantId, { email: 'f@test.com', password: 'secret123456', firstName: 'F', lastName: 'F', role: 'VENDEDOR' });
    await expect(UsersService.update(tenantId, user.id, { firstName: 'Hacked' })).rejects.toThrow(NotFoundError);
  });
});
