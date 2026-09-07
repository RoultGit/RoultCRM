import type { AccessTokenPayload } from './tokens.js';

export type Actor = AccessTokenPayload;

// Segundo eje de aislamiento, encima de tenantId: el spec de negocio (sección 12) dice que un
// VENDEDOR ve solo sus leads, sus clientes y sus deals. Un ADMIN ve todo lo de su tenant.
export function ownerFilter(actor: Actor): { assignedUserId?: string } {
  return actor.role === 'ADMIN' ? {} : { assignedUserId: actor.userId };
}

// Un VENDEDOR nunca puede asignarle un registro a otra persona, ni siquiera al crearlo: si lo
// intenta, el registro queda a su nombre. Sin esto, un vendedor podría crear un lead y perderlo
// de vista en el mismo request, porque ownerFilter ya no se lo mostraría.
export function defaultAssignee(actor: Actor, requested?: string): string | undefined {
  return actor.role === 'ADMIN' ? requested : actor.userId;
}
