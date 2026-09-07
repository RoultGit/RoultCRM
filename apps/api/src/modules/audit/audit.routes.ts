import { Router } from 'express';
import type { AuditEntryDTO } from '@ventry/shared';
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
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    const entries: AuditEntryDTO[] = rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: `${row.user.firstName} ${row.user.lastName}`,
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
