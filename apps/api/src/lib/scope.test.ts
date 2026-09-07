import { describe, it, expect } from 'vitest';
import { ownerFilter, defaultAssignee, type Actor } from './scope.js';

const admin: Actor = { userId: 'admin-1', tenantId: 't1', role: 'ADMIN' };
const seller: Actor = { userId: 'seller-1', tenantId: 't1', role: 'VENDEDOR' };

describe('ownerFilter', () => {
  it('does not restrict an admin', () => {
    expect(ownerFilter(admin)).toEqual({});
  });

  it('restricts a vendedor to their own records', () => {
    expect(ownerFilter(seller)).toEqual({ assignedUserId: 'seller-1' });
  });
});

describe('defaultAssignee', () => {
  it('assigns a vendedor their own new records', () => {
    expect(defaultAssignee(seller)).toBe('seller-1');
  });

  it('ignores a vendedor trying to assign a record to someone else', () => {
    expect(defaultAssignee(seller, 'seller-2')).toBe('seller-1');
  });

  it('lets an admin assign to anyone', () => {
    expect(defaultAssignee(admin, 'seller-2')).toBe('seller-2');
  });

  it('leaves an admin-created record unassigned when no assignee is given', () => {
    expect(defaultAssignee(admin)).toBeUndefined();
  });
});
