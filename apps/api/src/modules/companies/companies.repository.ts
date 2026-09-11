import { prisma } from '../../lib/prisma.js';
import type { Prisma, Line } from '@prisma/client';

export interface CompanyFilters {
  assignedUserId?: string;
  line?: Line;
}

/** El `where` se arma una sola vez y lo usan la página y el conteo: escritos por separado, el
 *  total terminaría contando filas que la página no devuelve. */
function buildWhere(tenantId: string, owner: { assignedUserId?: string }, filters: CompanyFilters = {}) {
  return {
        tenantId,
        // El scoping por dueño y el filtro del query van en AND, NUNCA como dos spreads en el
        // mismo objeto: ahí el último gana, y `?assignedUserId=<otro>` pisaba el scoping y le
        // devolvía a un vendedor la cartera de un colega. Intersecándolos, un vendedor que filtre
        // por otro dueño obtiene cero filas, que es la respuesta correcta.
        AND: [owner, {
          ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
          ...(filters.line ? { line: filters.line } : {}),
        }],
      };
}

export const CompaniesRepository = {
  findManyByTenant(tenantId: string, owner: { assignedUserId?: string } = {}, filters: CompanyFilters = {}, page?: { take: number; skip: number }) {
    return prisma.company.findMany({
      where: buildWhere(tenantId, owner, filters),
      orderBy: { createdAt: 'desc' },
      ...(page ?? {}),
    });
  },

  /** La página y el total, de la misma consulta. */
  async findPageByTenant(
    tenantId: string,
    owner: { assignedUserId?: string } = {}, filters: CompanyFilters = {},
    page: { take: number; skip: number } = { take: 50, skip: 0 }
  ) {
    const where = buildWhere(tenantId, owner, filters);
    const [items, total] = await prisma.$transaction([
      prisma.company.findMany({ where, orderBy: { createdAt: 'desc' }, ...page }),
      prisma.company.count({ where }),
    ]);
    return { items, total };
  },

  findByIdAndTenant(id: string, tenantId: string, owner: { assignedUserId?: string } = {}) {
    return prisma.company.findFirst({ where: { id, tenantId, ...owner } });
  },

  findPossibleDuplicate(
    tenantId: string,
    criteria: { name: string; email?: string; whatsapp?: string },
    excludeId?: string
  ) {
    const or: Prisma.CompanyWhereInput[] = [{ name: { equals: criteria.name, mode: 'insensitive' } }];
    if (criteria.email) or.push({ email: criteria.email });
    if (criteria.whatsapp) or.push({ whatsapp: criteria.whatsapp });
    return prisma.company.findFirst({
      where: { tenantId, OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
  },

  create(data: Prisma.CompanyUncheckedCreateInput, client: Prisma.TransactionClient = prisma) {
    return client.company.create({ data });
  },

  updateByIdAndTenant(id: string, tenantId: string, data: Prisma.CompanyUpdateInput) {
    return prisma.company.updateMany({ where: { id, tenantId }, data });
  },

  countDeals(companyId: string, tenantId: string) {
    return prisma.deal.count({ where: { companyId, tenantId } });
  },

  /**
   * Borra la empresa junto con lo que no puede existir sin ella. Va todo en una transacción: si
   * cualquiera de los pasos falla, no queda una empresa a medio borrar con contactos huérfanos.
   *
   * - Contactos: se van con la empresa. Un contacto sin empresa no es un dato, es una fila rota —
   *   la columna companyId es obligatoria y no hay a dónde moverlo.
   * - Leads convertidos: NO se borran. El lead es la prueba de que el prospecto existió, y borrarlo
   *   escondería de dónde vino el error. Se les suelta el vínculo y vuelven a "Calificado", que es
   *   el estado en el que estaban justo antes de la conversión equivocada.
   *
   * Las ventas no se tocan acá: el servicio se niega a borrar si hay alguna.
   */
  deleteWithDependents(id: string, tenantId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.lead.updateMany({
        where: { tenantId, convertedCompanyId: id },
        data: { convertedCompanyId: null, convertedAt: null, status: 'QUALIFIED' },
      });
      const contacts = await tx.contact.deleteMany({ where: { tenantId, companyId: id } });
      const company = await tx.company.deleteMany({ where: { id, tenantId } });
      return { contacts: contacts.count, companies: company.count };
    });
  },
};
