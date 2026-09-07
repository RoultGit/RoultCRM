import type { SearchResultDTO } from '@ventry/shared';
import { prisma } from '../../lib/prisma.js';
import { ownerFilter, type Actor } from '../../lib/scope.js';

// Cinco entidades, cinco resultados cada una. El tope es por entidad y no global para que una
// empresa con veinte contactos no tape a los leads que también matchean.
const PER_ENTITY = 5;

export const SearchService = {
  async search(actor: Actor, rawQuery: string): Promise<SearchResultDTO[]> {
    const q = rawQuery.trim();
    // Sin esta guarda, `contains: ''` matchea todo y la búsqueda vacía devuelve la base entera.
    if (!q) return [];

    const { tenantId } = actor;
    const owner = ownerFilter(actor);
    const like = { contains: q, mode: 'insensitive' as const };

    const [companies, contacts, leads, deals, users] = await Promise.all([
      prisma.company.findMany({
        where: { tenantId, ...owner, OR: [{ name: like }, { email: like }, { whatsapp: like }] },
        take: PER_ENTITY,
      }),
      prisma.contact.findMany({
        where: {
          tenantId,
          ...(owner.assignedUserId ? { company: { assignedUserId: owner.assignedUserId } } : {}),
          OR: [{ name: like }, { email: like }, { phone: like }, { whatsapp: like }],
        },
        take: PER_ENTITY,
        include: { company: { select: { name: true } } },
      }),
      prisma.lead.findMany({
        where: { tenantId, ...owner, OR: [{ businessName: like }, { contactName: like }, { email: like }] },
        take: PER_ENTITY,
      }),
      prisma.deal.findMany({
        where: { tenantId, ...owner, OR: [{ title: like }] },
        take: PER_ENTITY,
        include: { company: { select: { name: true } } },
      }),
      // Los vendedores son la excepción: no tienen dueño, y el spec (sección 17) los quiere
      // buscables. Un vendedor puede encontrar a un colega por nombre — eso es la guía telefónica
      // del equipo, no la cartera de nadie.
      prisma.user.findMany({
        where: { tenantId, OR: [{ firstName: like }, { lastName: like }, { email: like }] },
        take: PER_ENTITY,
      }),
    ]);

    return [
      ...companies.map((c) => ({ type: 'COMPANY' as const, id: c.id, label: c.name, sublabel: c.email, href: '/companies' })),
      ...contacts.map((c) => ({ type: 'CONTACT' as const, id: c.id, label: c.name, sublabel: c.company.name, href: '/contacts' })),
      ...leads.map((l) => ({ type: 'LEAD' as const, id: l.id, label: l.businessName, sublabel: l.contactName, href: '/leads' })),
      ...deals.map((d) => ({ type: 'DEAL' as const, id: d.id, label: d.title, sublabel: d.company.name, href: '/deals' })),
      ...users.map((u) => ({
        type: 'USER' as const,
        id: u.id,
        label: `${u.firstName} ${u.lastName}`,
        sublabel: u.email,
        href: '/team',
      })),
    ];
  },
};
