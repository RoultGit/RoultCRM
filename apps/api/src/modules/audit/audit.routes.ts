import { Router } from 'express';
import type { AuditEntryDTO } from '@roult/shared';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

export const auditRouter = Router();

// Solo ADMIN: la auditoría muestra movimientos de toda la cartera del tenant, incluida la de otros
// vendedores, así que abrirla a un VENDEDOR sería la misma fuga que se cerró en Plan 3.
auditRouter.use(requireAuth, requireRole('ADMIN'));

// ponytail: tope fijo de 200 filas, sin paginación. Un tenant con años de historia la va a
// necesitar; hoy la tabla arranca vacía.
const LIMIT = 200;

auditRouter.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.auditLog.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
    });

    // AuditLog.userId no tiene relación en la base a propósito (ver el comentario en schema.prisma),
    // así que el nombre se resuelve acá: una consulta para todos los actores de la página.
    const actors = await prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.userId))] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(actors.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));

    const entries: AuditEntryDTO[] = rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      // Un usuario borrado no debe hacer desaparecer su rastro: la entrada queda con el id crudo.
      userName: nameById.get(row.userId) ?? row.userId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      before: row.before,
      after: row.after,
      createdAt: row.createdAt.toISOString(),
    }));
    res.json(entries);
  } catch (err) {
    next(err);
  }
});
