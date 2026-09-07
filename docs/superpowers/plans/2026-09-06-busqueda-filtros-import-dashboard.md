# Plan 4 — Búsqueda, Filtros, Import/Export, Dashboard y Auditoría Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el MVP F1 con las cinco piezas que faltan — búsqueda global, filtros en las tablas, importación y exportación CSV, dashboard operativo y auditoría — sin modelos nuevos salvo lo estrictamente necesario.

**Architecture:** Mismo patrón de siempre: `routes → service → repository`, todo scopeado por `tenantId` del JWT y por `ownerFilter` cuando el actor es `VENDEDOR`. Los filtros son query params que se traducen a `where` de Prisma dentro del repositorio, así el scoping y el filtro se aplican en el mismo lugar. La auditoría estrena el modelo `AuditLog`, que existe en el schema desde Plan 1 pero **nunca se escribió**. La importación parsea el CSV en el navegador y manda filas JSON al backend, que las valida y devuelve una vista previa antes de confirmar — así el servidor no toca multipart ni archivos.

**Tech Stack:** Node/Express/TypeScript/Prisma (`apps/api`), React/TypeScript/Vite/Tailwind (`apps/web`), Zod (`packages/shared`), Vitest + Supertest, Vitest + Testing Library. Una dependencia nueva en el frontend: `papaparse` para leer CSV.

**Spec:** `roult-crm-mvp-y-roadmap-v2-vendedores.md` secciones 17 (búsqueda global), 18 (filtros), 19 (importación y exportación), 23 (dashboard operativo) y 25 (auditoría mínima); `docs/superpowers/specs/2026-09-05-ventry-crm-mvp-design.md` para el modelo `AuditLog`.

## Global Constraints

- **Decisiones de alcance tomadas al escribir este plan, porque el spec no las cierra:**
  1. **"Deals ganados"** (sección 23) no tiene etapa propia en el pipeline. Se define **ganado = el cliente ya puso plata**: `ADELANTO`, `PRODUCCION`, `ENTREGADO`, `MANTENIMIENTO`. Activo = `CONTACTO`, `PROPUESTA`, `NEGOCIACION`. Perdido = `PERDIDO`. Esta definición vive en un solo lugar (`packages/shared/src/deals.ts`) para que cambiarla sea una línea.
  2. **MRR queda fuera.** El spec lo pide en el dashboard pero el MVP no modela ingreso recurrente en ningún lado — no hay nada que sumar. Entra cuando exista el concepto.
  3. **Importación solo CSV, no Excel.** Excel exporta a CSV de forma nativa y `.xlsx` mete una dependencia de ~1MB para leer un formato que el usuario ya puede convertir con dos clics.
- **Dinero:** los agregados del dashboard **nunca** suman monedas distintas. Todo total monetario se devuelve como `{ PEN: string, USD: string }`, con los montos como string igual que en `DealDTO`.
- Todo repositorio sigue recibiendo `tenantId` y, cuando corresponde, `ownerFilter(actor)`. **Ningún endpoint nuevo puede saltear el scoping por dueño** — un vendedor no busca, filtra, exporta ni ve en el dashboard nada que no sea suyo.
- Los campos de texto opcionales usan `optionalText()` de `packages/shared/src/common.ts`.
- Las fechas de calendario se formatean y comparan con los helpers de `apps/web/src/lib/date.ts`, nunca con `new Date(...).toLocaleDateString()` pelado — eso corre el día en zonas de offset negativo.
- Los imports llevan extensión `.js` en todos lados.
- **Proceso de ejecución:** revisión inline propia en todas las tareas. Una sola revisión de subagente independiente para la **Tarea 9** (commit de la importación), que es la única que escribe muchos registros de una y donde un error deja la base a medio migrar. Sin pasada final de branch salvo que aparezca algo de seguridad o concurrencia.
- Verificación manual en navegador al terminar las 11 tareas, como en los planes 1, 2 y 3.

---

### Task 1: Búsqueda global — backend

**Files:**
- Create: `apps/api/src/modules/search/search.service.ts`
- Create: `apps/api/src/modules/search/search.routes.ts`
- Test: `apps/api/src/modules/search/search.routes.test.ts`
- Create: `packages/shared/src/search.ts`
- Modify: `packages/shared/src/index.ts`, `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `Actor`, `ownerFilter` de `lib/scope.js`.
- Produces: `SearchResultDTO` y `SearchResponseDTO` en `@ventry/shared`; `GET /search?q=`. La Tarea 2 los consume.

- [ ] **Step 1: Escribir el test que falla**

Creá `apps/api/src/modules/search/search.routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/search routes', () => {
  const app = createApp();
  let tenantId: string;
  let token: string;
  let sellerId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Search Tenant' } })).id;
    token = signAccessToken({ userId: 'admin-1', tenantId, role: 'ADMIN' });
    sellerId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `search-seller-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Buscable',
          lastName: 'Vendedor',
          role: 'VENDEDOR',
        },
      })
    ).id;
    const company = await prisma.company.create({
      data: { tenantId, name: 'ABC SAC', line: 'WEB', assignedUserId: sellerId },
    });
    await prisma.contact.create({ data: { tenantId, companyId: company.id, name: 'Carlos ABC' } });
    await prisma.lead.create({ data: { tenantId, businessName: 'ABC Prospecto', contactName: 'Ana', line: 'WEB' } });
    await prisma.deal.create({
      data: { tenantId, companyId: company.id, title: 'Web ABC', amount: '100', currency: 'PEN', assignedUserId: sellerId },
    });
  });

  afterAll(async () => {
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.contact.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    expect((await request(app).get('/search?q=ABC')).status).toBe(401);
  });

  it('finds matches across every entity', async () => {
    const res = await request(app).get('/search?q=ABC').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const types = res.body.results.map((r: { type: string }) => r.type);
    expect(types).toContain('COMPANY');
    expect(types).toContain('CONTACT');
    expect(types).toContain('LEAD');
    expect(types).toContain('DEAL');
  });

  it('matches case-insensitively', async () => {
    const res = await request(app).get('/search?q=abc%20sac').set('Authorization', `Bearer ${token}`);
    expect(res.body.results.some((r: { label: string }) => r.label === 'ABC SAC')).toBe(true);
  });

  it('returns nothing for a blank query instead of everything', async () => {
    const res = await request(app).get('/search?q=%20').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
  });

  it('hides another vendedor’s records from a vendedor', async () => {
    const other = signAccessToken({ userId: 'seller-other', tenantId, role: 'VENDEDOR' });
    const res = await request(app).get('/search?q=ABC').set('Authorization', `Bearer ${other}`);
    const types = res.body.results.map((r: { type: string }) => r.type);
    expect(types).not.toContain('COMPANY');
    expect(types).not.toContain('DEAL');
  });

  it('finds vendedores by name', async () => {
    const res = await request(app).get('/search?q=Buscable').set('Authorization', `Bearer ${token}`);
    expect(res.body.results.some((r: { type: string }) => r.type === 'USER')).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test -w @ventry/api -- search`
Expected: FAIL, `Cannot find module './modules/search/search.routes.js'`.

- [ ] **Step 3: Escribir los tipos compartidos**

Creá `packages/shared/src/search.ts`:

```ts
export type SearchResultType = 'COMPANY' | 'CONTACT' | 'LEAD' | 'DEAL' | 'USER';

export interface SearchResultDTO {
  type: SearchResultType;
  id: string;
  label: string;
  sublabel: string | null;
  /** Ruta del frontend a la que lleva el resultado. */
  href: string;
}

export interface SearchResponseDTO {
  results: SearchResultDTO[];
}
```

Exportalo en `packages/shared/src/index.ts`: `export * from './search.js';`

- [ ] **Step 4: Escribir el servicio**

Creá `apps/api/src/modules/search/search.service.ts`:

```ts
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
      ...users.map((u) => ({ type: 'USER' as const, id: u.id, label: `${u.firstName} ${u.lastName}`, sublabel: u.email, href: '/team' })),
    ];
  },
};
```

- [ ] **Step 5: Escribir las rutas y montarlas**

Creá `apps/api/src/modules/search/search.routes.ts`:

```ts
import { Router } from 'express';
import { SearchService } from './search.service.js';
import { requireAuth } from '../../middleware/auth.js';

export const searchRouter = Router();

searchRouter.use(requireAuth);

searchRouter.get('/', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ results: await SearchService.search(req.user!, q) });
  } catch (err) {
    next(err);
  }
});
```

En `apps/api/src/app.ts`, junto a los otros routers:

```ts
import { searchRouter } from './modules/search/search.routes.js';
```
```ts
  app.use('/search', searchRouter);
```

- [ ] **Step 6: Correr los tests**

Run: `npm run test -w @ventry/api -- search`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src apps/api/src
git commit -m "feat: add global search across every entity"
```

---

### Task 2: Búsqueda global — frontend

**Files:**
- Create: `apps/web/src/hooks/useSearch.ts`
- Test: `apps/web/src/hooks/useSearch.test.tsx`
- Create: `apps/web/src/components/layout/GlobalSearch.tsx`
- Modify: `apps/web/src/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes: `GET /search?q=`, `SearchResultDTO`.
- Produces: `useSearch(q)`; el componente `GlobalSearch` montado en el AppShell.

- [ ] **Step 1: Escribir el test que falla**

Creá `apps/web/src/hooks/useSearch.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../lib/api.js';
import { useSearch } from './useSearch.js';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSearch', () => {
  it('does not hit the API for a blank query', async () => {
    const get = vi.spyOn(apiClient, 'get');
    renderHook(() => useSearch('  '), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(get).not.toHaveBeenCalled();
  });

  it('returns the results for a real query', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { results: [{ type: 'COMPANY', id: '1', label: 'ABC SAC', sublabel: null, href: '/companies' }] },
    });
    const { result } = renderHook(() => useSearch('ABC'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test -w @ventry/web -- useSearch`
Expected: FAIL, no resuelve `./useSearch.js`.

- [ ] **Step 3: Escribir el hook**

Creá `apps/web/src/hooks/useSearch.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import type { SearchResponseDTO } from '@ventry/shared';
import { apiClient } from '../lib/api.js';

export function useSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['search', q],
    // `enabled` evita un request por cada tecla mientras el campo está vacío, y el backend además
    // devuelve [] para una query en blanco, así que la guarda está de los dos lados.
    enabled: q.length >= 2,
    queryFn: async () => (await apiClient.get<SearchResponseDTO>('/search', { params: { q } })).data.results,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm run test -w @ventry/web -- useSearch`
Expected: PASS, 2 tests.

- [ ] **Step 5: Escribir el componente**

Creá `apps/web/src/components/layout/GlobalSearch.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { SearchResultDTO } from '@ventry/shared';
import { useSearch } from '../../hooks/useSearch.js';

const TYPE_LABEL: Record<SearchResultDTO['type'], string> = {
  COMPANY: 'Empresa',
  CONTACT: 'Contacto',
  LEAD: 'Lead',
  DEAL: 'Deal',
  USER: 'Vendedor',
};

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { data: results, isFetching } = useSearch(query);

  // ⌘K / Ctrl+K enfoca el campo, que es lo que el spec técnico pedía para la topbar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (result: SearchResultDTO) => {
    setOpen(false);
    setQuery('');
    navigate(result.href);
  };

  return (
    <div className="relative w-96 max-w-full">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm"
        placeholder="Buscar empresas, contactos, leads, deals… (⌘K)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // onMouseDown en los resultados corre antes que este blur, así que el clic llega.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {isFetching && !results ? (
            <p className="px-3 py-2 text-sm text-gray-500">Buscando…</p>
          ) : results && results.length > 0 ? (
            <ul>
              {results.map((result) => (
                <li key={`${result.type}-${result.id}`}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                    onMouseDown={() => go(result)}
                  >
                    <span className="truncate">
                      <span className="text-gray-900">{result.label}</span>
                      {result.sublabel && <span className="ml-2 text-gray-500">{result.sublabel}</span>}
                    </span>
                    <span className="shrink-0 text-xs uppercase tracking-wide text-gray-400">
                      {TYPE_LABEL[result.type]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-gray-500">Sin resultados para "{query.trim()}".</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Montarlo en el AppShell**

En `apps/web/src/components/layout/AppShell.tsx`, envolvé el `<Outlet />` en una topbar. Reemplazá el bloque `<main>` por:

```tsx
      <main className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 py-3">
          <GlobalSearch />
          <span className="text-sm text-gray-600">
            {session.data?.firstName} {session.data?.lastName}
          </span>
        </header>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
```

con su import. `min-w-0` se queda donde está: sin eso el tablero de deals vuelve a estirar la página entera.

- [ ] **Step 7: Verificar build y tests**

Run: `npm run build && npm test`
Expected: exit 0 y todo verde.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat: add the global search box to the app shell"
```

---

### Task 3: Filtros — backend

**Files:**
- Modify: `packages/shared/src/leads.ts`, `packages/shared/src/companies.ts`, `packages/shared/src/deals.ts`
- Modify: los cuatro repositorios y servicios de `leads`, `companies`, `deals`, `users`
- Modify: las cuatro rutas correspondientes
- Test: `apps/api/src/modules/deals/deals.routes.test.ts` y `leads.routes.test.ts` (agregar casos)

**Interfaces:**
- Produces: `leadFiltersSchema`, `companyFiltersSchema`, `dealFiltersSchema` en `@ventry/shared`; los `GET` de las cuatro listas aceptan query params. La Tarea 4 y la 7 los usan.

Filtros mínimos según la sección 18 del spec: Leads por estado, vendedor, línea y origen; Clientes (empresas) por vendedor y línea; Deals por vendedor, etapa, línea, moneda y fecha; Vendedores por estado.

`Company` no tiene columna `line`… sí la tiene (`line Line`), pero **`Deal` no**: la línea de un deal es la de su empresa, así que el filtro por línea en deals va por la relación.

- [ ] **Step 1: Escribir los tests que fallan**

Agregá a `apps/api/src/modules/deals/deals.routes.test.ts`, dentro del `describe`:

```ts
  it('filters deals by stage', async () => {
    const a = await createDeal();
    const b = await createDeal();
    await request(app)
      .patch(`/deals/${b.id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'NEGOCIACION' });

    const res = await request(app).get('/deals?stage=NEGOCIACION').set('Authorization', `Bearer ${token}`);
    const ids = res.body.map((d: { id: string }) => d.id);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain(a.id);
  });

  it('filters deals by currency and by assigned vendedor', async () => {
    const pen = await createDeal();
    const usd = await request(app)
      .post('/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, title: 'En dólares', amount: '500', currency: 'USD', assignedUserId: sellerId });

    const byCurrency = await request(app).get('/deals?currency=USD').set('Authorization', `Bearer ${token}`);
    expect(byCurrency.body.map((d: { id: string }) => d.id)).toEqual([usd.body.id]);

    const bySeller = await request(app)
      .get(`/deals?assignedUserId=${sellerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(bySeller.body.map((d: { id: string }) => d.id)).toEqual([usd.body.id]);
    expect(bySeller.body.map((d: { id: string }) => d.id)).not.toContain(pen.id);
  });

  it('ignores an unknown filter value instead of returning everything', async () => {
    await createDeal();
    const res = await request(app).get('/deals?stage=NO_EXISTE').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
```

Y a `apps/api/src/modules/leads/leads.routes.test.ts`:

```ts
  it('filters leads by status and by line', async () => {
    const web = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ businessName: 'Uno', contactName: 'A', line: 'WEB' });
    const soft = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ businessName: 'Dos', contactName: 'B', line: 'SOFTWARE' });
    await request(app)
      .patch(`/leads/${soft.body.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CONTACTED' });

    const byLine = await request(app).get('/leads?line=SOFTWARE').set('Authorization', `Bearer ${token}`);
    expect(byLine.body.map((l: { id: string }) => l.id)).toEqual([soft.body.id]);

    const byStatus = await request(app).get('/leads?status=NEW').set('Authorization', `Bearer ${token}`);
    expect(byStatus.body.map((l: { id: string }) => l.id)).toContain(web.body.id);
    expect(byStatus.body.map((l: { id: string }) => l.id)).not.toContain(soft.body.id);
  });
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm run test -w @ventry/api -- deals leads`
Expected: FAIL — los filtros se ignoran, así que las listas vuelven completas.

- [ ] **Step 3: Escribir los schemas de filtros**

Agregá a `packages/shared/src/leads.ts`:

```ts
export const leadFiltersSchema = z.object({
  status: leadStatusSchema.optional(),
  assignedUserId: optionalText(z.string()),
  line: lineSchema.optional(),
  source: optionalText(z.string()),
});
```

A `packages/shared/src/companies.ts`:

```ts
export const companyFiltersSchema = z.object({
  assignedUserId: optionalText(z.string()),
  line: lineSchema.optional(),
});
```

A `packages/shared/src/deals.ts`:

```ts
export const dealFiltersSchema = z.object({
  stage: dealStageSchema.optional(),
  assignedUserId: optionalText(z.string()),
  currency: currencySchema.optional(),
  line: lineSchema.optional(),
  from: optionalText(z.string().date()),
  to: optionalText(z.string().date()),
});
```

`lineSchema` y `currencySchema` ya se importan en esos archivos; agregá `optionalText` donde falte.

- [ ] **Step 4: Traducir los filtros a `where` en cada repositorio**

En `apps/api/src/modules/deals/deals.repository.ts`, cambiá `findManyByTenant`:

```ts
  findManyByTenant(
    tenantId: string,
    owner: { assignedUserId?: string } = {},
    filters: {
      stage?: DealStage;
      assignedUserId?: string;
      currency?: Currency;
      line?: Line;
      from?: string;
      to?: string;
    } = {}
  ) {
    return prisma.deal.findMany({
      where: {
        tenantId,
        ...owner,
        ...(filters.stage ? { stage: filters.stage } : {}),
        // El filtro explícito pisa al de scoping: un ADMIN puede pedir los deals de un vendedor
        // concreto, y a un VENDEDOR el `owner` ya lo dejó encerrado en los suyos igual.
        ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
        ...(filters.currency ? { currency: filters.currency } : {}),
        // Deal no tiene línea propia: la hereda de su empresa.
        ...(filters.line ? { company: { line: filters.line } } : {}),
        ...(filters.from || filters.to
          ? {
              createdAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                // `to` es inclusivo para el usuario: "hasta el 9" incluye todo el día 9.
                ...(filters.to ? { lt: new Date(new Date(filters.to).getTime() + 86_400_000) } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      ...withCompany,
    });
  },
```

Importá los tipos `DealStage`, `Currency` y `Line` de `@prisma/client` en ese archivo.

Aplicá el mismo patrón a `leads.repository.ts` (`status`, `assignedUserId`, `line`, `source` con `contains`/`insensitive`), a `companies.repository.ts` (`assignedUserId`, `line`) y a `users.repository.ts` (`status`).

- [ ] **Step 5: Parsear los filtros en las rutas**

En `apps/api/src/modules/deals/deals.routes.ts`:

```ts
dealsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = dealFiltersSchema.safeParse(req.query);
    // Un filtro con un valor inválido tiene que ser un error, no un filtro ignorado: silenciarlo
    // devolvería la lista completa y el usuario creería que ese es el resultado del filtro.
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await DealsService.list(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});
```

Y en el servicio, `list(actor, filters = {})` que pasa `filters` al repositorio. Mismo cambio en leads, companies y users.

- [ ] **Step 6: Correr toda la suite**

Run: `npm run test -w @ventry/api`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src apps/api/src
git commit -m "feat: filter leads, companies, deals and vendedores by query params"
```

---

### Task 4: Filtros — frontend

**Files:**
- Create: `apps/web/src/components/FilterBar.tsx`
- Modify: `apps/web/src/hooks/useLeads.ts`, `useCompanies.ts`, `useDeals.ts`
- Modify: `apps/web/src/pages/LeadsPage.tsx`, `CompaniesPage.tsx`, `DealsPage.tsx`

**Interfaces:**
- Consumes: los query params de la Tarea 3.
- Produces: `FilterBar`; los hooks de lista aceptan un objeto de filtros y lo mandan como params.

- [ ] **Step 1: Que los hooks acepten filtros**

En `apps/web/src/hooks/useDeals.ts`:

```ts
export interface DealFilters {
  stage?: string;
  assignedUserId?: string;
  currency?: string;
  line?: string;
}

export function useDeals(filters: DealFilters = {}) {
  return useQuery({
    // Los filtros entran en la queryKey: sin eso TanStack sirve el resultado cacheado del filtro
    // anterior y la tabla no cambia al filtrar.
    queryKey: [...DEALS_KEY, filters],
    queryFn: async () => (await apiClient.get<DealDTO[]>('/deals', { params: filters })).data,
  });
}
```

Ojo con las invalidaciones: `queryClient.invalidateQueries({ queryKey: DEALS_KEY })` sigue funcionando porque hace match por prefijo. No hace falta tocar las mutaciones.

Mismo cambio en `useLeads` (`LeadFilters`: status, assignedUserId, line, source) y `useCompanies` (`CompanyFilters`: assignedUserId, line).

- [ ] **Step 2: Escribir la barra de filtros**

Creá `apps/web/src/components/FilterBar.tsx`:

```tsx
import { useUsers } from '../hooks/useUsers.js';

export interface FilterField {
  key: string;
  label: string;
  /** `vendedores` se llena solo con la lista de usuarios del tenant. */
  options: { value: string; label: string }[] | 'vendedores';
}

export function FilterBar({
  fields,
  value,
  onChange,
}: {
  fields: FilterField[];
  value: Record<string, string | undefined>;
  onChange: (next: Record<string, string | undefined>) => void;
}) {
  const { data: users } = useUsers();
  const active = Object.values(value).some(Boolean);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {fields.map((field) => {
        const options =
          field.options === 'vendedores'
            ? (users ?? []).map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))
            : field.options;
        return (
          <select
            key={field.key}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            value={value[field.key] ?? ''}
            aria-label={field.label}
            onChange={(e) => onChange({ ...value, [field.key]: e.target.value || undefined })}
          >
            <option value="">{field.label}: todos</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      })}
      {active && (
        <button type="button" className="text-sm text-gray-500 underline" onClick={() => onChange({})}>
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Montarla en las tres páginas**

En `DealsPage`, arriba del tablero:

```tsx
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});
  const { data: deals, isLoading } = useDeals(filters);
```

```tsx
      <FilterBar
        value={filters}
        onChange={setFilters}
        fields={[
          { key: 'stage', label: 'Etapa', options: STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] })) },
          { key: 'assignedUserId', label: 'Vendedor', options: 'vendedores' },
          { key: 'line', label: 'Línea', options: [{ value: 'WEB', label: 'Web' }, { value: 'SOFTWARE', label: 'Software' }] },
          { key: 'currency', label: 'Moneda', options: [{ value: 'PEN', label: 'PEN' }, { value: 'USD', label: 'USD' }] },
        ]}
      />
```

En `LeadsPage`, campos `status` (usando `SELECTABLE_STATUS` + `CONVERTED` con `STATUS_LABEL`), `assignedUserId` y `line`. En `CompaniesPage`, `assignedUserId` y `line`.

- [ ] **Step 4: Verificar build y tests**

Run: `npm run build && npm test`
Expected: exit 0, todo verde.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat: add filter bars to leads, companies and the pipeline"
```

---

### Task 5: Auditoría — escribir el log

`AuditLog` existe en `schema.prisma` desde Plan 1 y nunca se escribió una fila. Esta tarea lo estrena.

**Files:**
- Create: `apps/api/src/lib/audit.ts`
- Test: `apps/api/src/lib/audit.test.ts`
- Modify: los servicios de `companies`, `contacts`, `leads`, `deals`, `users`

**Interfaces:**
- Produces: `recordAudit(actor, { action, entityType, entityId, before?, after? })`. La Tarea 6 lee lo que esto escribe.

- [ ] **Step 1: Escribir el test que falla**

Creá `apps/api/src/lib/audit.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from './prisma.js';
import { recordAudit } from './audit.js';
import type { Actor } from './scope.js';

describe('recordAudit', () => {
  let tenantId: string;
  let userId: string;
  let actor: Actor;

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { name: 'Audit Tenant' } })).id;
    userId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `audit-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Audit',
          lastName: 'User',
          role: 'ADMIN',
        },
      })
    ).id;
    actor = { userId, tenantId, role: 'ADMIN' };
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('writes a row with who, what and when', async () => {
    await recordAudit(actor, { action: 'CREATE', entityType: 'LEAD', entityId: 'lead-1', after: { businessName: 'ABC' } });
    const rows = await prisma.auditLog.findMany({ where: { tenantId, entityId: 'lead-1' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(userId);
    expect(rows[0].action).toBe('CREATE');
    expect(rows[0].after).toEqual({ businessName: 'ABC' });
  });

  it('never throws when the log write fails', async () => {
    // Un userId inexistente rompe la foreign key. Auditar no puede tumbar la operación que audita:
    // perder una línea de log es malo, perder el registro del cliente es peor.
    const ghost: Actor = { userId: 'no-existe', tenantId, role: 'ADMIN' };
    await expect(
      recordAudit(ghost, { action: 'CREATE', entityType: 'LEAD', entityId: 'lead-2' })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test -w @ventry/api -- audit`
Expected: FAIL, no existe `./audit.js`.

- [ ] **Step 3: Escribir el helper**

Creá `apps/api/src/lib/audit.ts`:

```ts
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import type { Actor } from './scope.js';

export type AuditAction = 'CREATE' | 'UPDATE' | 'STAGE_CHANGE' | 'ASSIGN' | 'STATUS_CHANGE' | 'CONVERT';
export type AuditEntity = 'COMPANY' | 'CONTACT' | 'LEAD' | 'DEAL' | 'USER';

export async function recordAudit(
  actor: Actor,
  entry: {
    action: AuditAction;
    entityType: AuditEntity;
    entityId: string;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
  }
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        userId: actor.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before,
        after: entry.after,
      },
    });
  } catch (err) {
    // Auditar nunca puede tumbar la operación que audita: perder una línea de log es malo, perder
    // el registro del cliente es peor. Queda en la consola para no perderlo en silencio.
    console.error('audit write failed', err);
  }
}
```

- [ ] **Step 4: Llamarlo desde los servicios**

Una llamada al final de cada operación que muta, después de que la escritura principal ya salió bien. En `LeadsService`:

```ts
    await recordAudit(actor, { action: 'CREATE', entityType: 'LEAD', entityId: lead.id, after: toDTO(lead) as unknown as Prisma.InputJsonValue });
```

Puntos exactos donde va, uno por línea:
- `CompaniesService.create` → `CREATE`/`COMPANY`; `.update` → `UPDATE`/`COMPANY` con `before` (el `existing` que ya se consulta) y `after`.
- `ContactsService.create`/`.update` → igual con `CONTACT`.
- `LeadsService.create`/`.update` → `LEAD`; `.setStatus` → `STATUS_CHANGE` con `before: { status: existing.status }` y `after: { status }`; `.convert` → `CONVERT` con `after: { companyId, contactId }`.
- `DealsService.create`/`.update` → `DEAL`; `.setStage` → `STAGE_CHANGE` con `before: { stage: existing.stage }` y `after: { stage, lostReason }`; `.assign` → `ASSIGN` con `before: { assignedUserId: existing.assignedUserId }` y `after: { assignedUserId }`, dentro del mismo `if` que ya evita registrar reasignaciones que no cambian nada.
- `UsersService.create`/`.update`/`.setStatus` → `USER`.

`ponytail:` sin interceptor genérico ni middleware de auditoría. Son doce llamadas explícitas, se leen donde pasan las cosas, y un interceptor que adivine el `entityId` a partir de la ruta es justo lo que alguien tiene que descifrar a las 3am.

- [ ] **Step 5: Correr toda la suite**

Run: `npm run test -w @ventry/api`
Expected: PASS. Ojo: los `afterAll` de los tests que crean usuarios ahora también tienen que limpiar `auditLog` antes de borrar el usuario, porque `AuditLog.userId` es una foreign key a `User`. Agregá `await prisma.auditLog.deleteMany({ where: { tenantId } });` como primera línea del `afterAll` en cada archivo de test que borre usuarios.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src
git commit -m "feat: start writing the audit log that has existed unused since Plan 1"
```

---

### Task 6: Auditoría — endpoint y página

**Files:**
- Create: `apps/api/src/modules/audit/audit.routes.ts`
- Test: `apps/api/src/modules/audit/audit.routes.test.ts`
- Create: `packages/shared/src/audit.ts`
- Create: `apps/web/src/hooks/useAudit.ts`, `apps/web/src/pages/AuditPage.tsx`
- Modify: `apps/api/src/app.ts`, `packages/shared/src/index.ts`, `apps/web/src/routes/router.tsx`, `apps/web/src/components/layout/AppShell.tsx`

**Interfaces:**
- Produces: `AuditEntryDTO`; `GET /audit` (solo ADMIN); la ruta `/audit`.

- [ ] **Step 1: Escribir el test que falla**

Creá `apps/api/src/modules/audit/audit.routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/audit routes', () => {
  const app = createApp();
  let tenantId: string;
  let adminToken: string;
  let userId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Audit Route Tenant' } })).id;
    userId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `audit-route-${Date.now()}@roult.pe`,
          passwordHash: 'x',
          firstName: 'Admin',
          lastName: 'Uno',
          role: 'ADMIN',
        },
      })
    ).id;
    adminToken = signAccessToken({ userId, tenantId, role: 'ADMIN' });
    await prisma.auditLog.create({
      data: { tenantId, userId, action: 'ASSIGN', entityType: 'DEAL', entityId: 'deal-1' },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    expect((await request(app).get('/audit')).status).toBe(401);
  });

  it('refuses a vendedor', async () => {
    const seller = signAccessToken({ userId: 'seller-1', tenantId, role: 'VENDEDOR' });
    expect((await request(app).get('/audit').set('Authorization', `Bearer ${seller}`)).status).toBe(403);
  });

  it('returns the log with the actor’s name resolved', async () => {
    const res = await request(app).get('/audit').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body[0].action).toBe('ASSIGN');
    expect(res.body[0].userName).toBe('Admin Uno');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test -w @ventry/api -- audit.routes`
Expected: FAIL con 404.

- [ ] **Step 3: Escribir el DTO, la ruta y montarla**

Creá `packages/shared/src/audit.ts`:

```ts
export interface AuditEntryDTO {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}
```

Exportalo en el índice. Creá `apps/api/src/modules/audit/audit.routes.ts`:

```ts
import { Router } from 'express';
import type { AuditEntryDTO } from '@ventry/shared';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

export const auditRouter = Router();

// Solo ADMIN: la auditoría muestra movimientos de toda la cartera del tenant, incluida la de otros
// vendedores, así que abrirla a un VENDEDOR sería la misma fuga que se cerró en Plan 3.
auditRouter.use(requireAuth, requireRole('ADMIN'));

auditRouter.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.auditLog.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
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
```

Montala en `app.ts` con `app.use('/audit', auditRouter);`.

`ponytail:` el tope de 200 filas es fijo, sin paginación. Un tenant con años de historia la va a necesitar; hoy la tabla tiene cero filas.

- [ ] **Step 4: Escribir el hook y la página**

`apps/web/src/hooks/useAudit.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import type { AuditEntryDTO } from '@ventry/shared';
import { apiClient } from '../lib/api.js';

export function useAudit() {
  return useQuery({
    queryKey: ['audit'],
    queryFn: async () => (await apiClient.get<AuditEntryDTO[]>('/audit')).data,
  });
}
```

`apps/web/src/pages/AuditPage.tsx`: una `Card` con una tabla de cuatro columnas — Cuándo (`new Date(createdAt).toLocaleString('es-PE')`, que acá sí lleva hora y por eso no usa el helper de fecha-calendario), Quién (`userName`), Qué (`ACTION_LABEL[action]` + `ENTITY_LABEL[entityType]`) y Detalle (para `ASSIGN` y `STAGE_CHANGE`, `before → after`; para el resto, `—`). Etiquetas en español: CREATE «Creó», UPDATE «Modificó», STAGE_CHANGE «Cambió de etapa», ASSIGN «Reasignó», STATUS_CHANGE «Cambió el estado», CONVERT «Convirtió».

Registrá la ruta `{ path: 'audit', element: <AuditPage /> }` y agregá la entrada al sidebar (`{ to: '/audit', label: 'Auditoría', icon: History }` de lucide-react), **visible solo para ADMIN** — el endpoint responde 403 a un vendedor, así que mostrarle el link sería ofrecerle una puerta cerrada.

- [ ] **Step 5: Verificar build y tests**

Run: `npm run build && npm test`
Expected: exit 0, todo verde.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src apps/api/src apps/web/src
git commit -m "feat: add the audit log endpoint and page"
```

---

### Task 7: Exportación CSV

**Files:**
- Create: `apps/api/src/lib/csv.ts`
- Test: `apps/api/src/lib/csv.test.ts`
- Modify: `apps/api/src/modules/leads/leads.routes.ts`, `companies.routes.ts`, `deals.routes.ts`
- Modify: `apps/web/src/components/FilterBar.tsx` (botón de exportar)

**Interfaces:**
- Produces: `toCsv(rows, columns)`; `GET /leads/export`, `/companies/export`, `/deals/export`, que respetan los mismos filtros de la Tarea 3.

- [ ] **Step 1: Escribir el test que falla**

Creá `apps/api/src/lib/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toCsv } from './csv.js';

describe('toCsv', () => {
  it('writes a header row and one row per record', () => {
    const csv = toCsv([{ a: '1', b: '2' }], [
      { key: 'a', header: 'Uno' },
      { key: 'b', header: 'Dos' },
    ]);
    expect(csv).toBe('Uno,Dos\r\n1,2');
  });

  it('quotes values containing a comma, a quote or a newline', () => {
    const csv = toCsv([{ a: 'Pérez, Juan', b: 'dijo "hola"', c: 'línea1\nlínea2' }], [
      { key: 'a', header: 'A' },
      { key: 'b', header: 'B' },
      { key: 'c', header: 'C' },
    ]);
    expect(csv).toBe('A,B,C\r\n"Pérez, Juan","dijo ""hola""","línea1\nlínea2"');
  });

  it('writes an empty cell for null and undefined', () => {
    const csv = toCsv([{ a: null, b: undefined }], [
      { key: 'a', header: 'A' },
      { key: 'b', header: 'B' },
    ]);
    expect(csv).toBe('A,B\r\n,');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test -w @ventry/api -- csv`
Expected: FAIL, no existe `./csv.js`.

- [ ] **Step 3: Escribir el serializador**

Creá `apps/api/src/lib/csv.ts`:

```ts
export interface CsvColumn<T> {
  key: keyof T & string;
  header: string;
}

// Serializar CSV bien son quince líneas y no vale una dependencia. Parsearlo es otra historia — eso
// pasa en el navegador con papaparse, porque comillas y saltos de línea embebidos sí tienen filo.
function escape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((column) => escape(column.header)).join(',');
  const body = rows.map((row) => columns.map((column) => escape(row[column.key])).join(','));
  // CRLF es lo que Excel espera; con LF solo, algunas versiones meten todo en una fila.
  return [header, ...body].join('\r\n');
}
```

- [ ] **Step 4: Agregar las rutas de exportación**

En `apps/api/src/modules/deals/deals.routes.ts`, **antes** de `dealsRouter.patch('/:id'…)` para que `/export` no lo capture como un id:

```ts
dealsRouter.get('/export', async (req, res, next) => {
  try {
    const parsed = dealFiltersSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const deals = await DealsService.list(req.user!, parsed.data);
    const csv = toCsv(deals as unknown as Record<string, unknown>[], [
      { key: 'companyName', header: 'Empresa' },
      { key: 'title', header: 'Deal' },
      { key: 'amount', header: 'Monto' },
      { key: 'currency', header: 'Moneda' },
      { key: 'stage', header: 'Etapa' },
      { key: 'lostReason', header: 'Motivo de pérdida' },
      { key: 'nextStepDescription', header: 'Próximo paso' },
      { key: 'createdAt', header: 'Creado' },
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="deals.csv"');
    // El BOM es lo que hace que Excel abra el archivo en UTF-8; sin él, "Pérez" sale como "PÃ©rez".
    res.send('﻿' + csv);
  } catch (err) {
    next(err);
  }
});
```

Análogo en leads (Empresa/persona, Contacto, Estado, Línea, Origen, Correo, WhatsApp, Creado) y companies (Empresa, Línea, Ciudad, Correo, WhatsApp, Creado).

- [ ] **Step 5: Botón de exportar en el frontend**

Agregá al final de la `FilterBar` un `exportPath?: string`; cuando venga, renderizá un enlace que arme la URL con los filtros actuales. **No** puede ser un `<a href>` pelado: la ruta necesita el header `Authorization`, que un enlace no manda. Descargá con el `apiClient` y un blob:

```tsx
  const exportCsv = async () => {
    const res = await apiClient.get(exportPath!, { params: value, responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportPath!.split('/')[1] + '.csv';
    link.click();
    URL.revokeObjectURL(url);
  };
```

- [ ] **Step 6: Verificar build y tests**

Run: `npm run build && npm test`
Expected: exit 0, todo verde.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src apps/web/src
git commit -m "feat: export leads, companies and deals to CSV with the active filters"
```

---

### Task 8: Importación — backend, vista previa

**Files:**
- Create: `packages/shared/src/import.ts`
- Create: `apps/api/src/modules/import/import.service.ts`, `import.routes.ts`
- Test: `apps/api/src/modules/import/import.routes.test.ts`
- Modify: `packages/shared/src/index.ts`, `apps/api/src/app.ts`

**Interfaces:**
- Produces: `importPreviewSchema`, `ImportPreviewDTO`, `ImportRowResult`; `POST /import/:entity/preview`. La Tarea 9 agrega el commit y la 10 lo consume.

- [ ] **Step 1: Escribir el test que falla**

Creá `apps/api/src/modules/import/import.routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/import routes', () => {
  const app = createApp();
  let tenantId: string;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Import Tenant' } })).id;
    token = signAccessToken({ userId: 'admin-1', tenantId, role: 'ADMIN' });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.company.deleteMany({ where: { tenantId } });
  });

  it('rejects an unknown entity', async () => {
    const res = await request(app)
      .post('/import/pinguinos/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [] });
    expect(res.status).toBe(400);
  });

  it('marks valid rows as new', async () => {
    const res = await request(app)
      .post('/import/companies/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ name: 'Nueva SAC', line: 'WEB' }] });
    expect(res.status).toBe(200);
    expect(res.body.rows[0].status).toBe('NEW');
    expect(res.body.summary).toEqual({ new: 1, duplicate: 0, invalid: 0 });
  });

  it('marks rows that fail validation as invalid, with the reason', async () => {
    const res = await request(app)
      .post('/import/companies/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ name: '', line: 'PLASTICO' }] });
    expect(res.body.rows[0].status).toBe('INVALID');
    expect(res.body.rows[0].message).toBeTruthy();
    expect(res.body.summary.invalid).toBe(1);
  });

  it('marks rows matching an existing record as duplicates', async () => {
    await prisma.company.create({ data: { tenantId, name: 'Repetida SAC', line: 'WEB' } });
    const res = await request(app)
      .post('/import/companies/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ name: 'Repetida SAC', line: 'WEB' }] });
    expect(res.body.rows[0].status).toBe('DUPLICATE');
    expect(res.body.summary.duplicate).toBe(1);
  });

  it('writes nothing to the database during a preview', async () => {
    await request(app)
      .post('/import/companies/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ name: 'Fantasma SAC', line: 'WEB' }] });
    expect(await prisma.company.count({ where: { tenantId } })).toBe(0);
  });

  it('refuses a vendedor', async () => {
    const seller = signAccessToken({ userId: 'seller-1', tenantId, role: 'VENDEDOR' });
    const res = await request(app)
      .post('/import/companies/preview')
      .set('Authorization', `Bearer ${seller}`)
      .send({ rows: [{ name: 'X', line: 'WEB' }] });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test -w @ventry/api -- import`
Expected: FAIL con 404.

- [ ] **Step 3: Escribir los tipos compartidos**

Creá `packages/shared/src/import.ts`:

```ts
import { z } from 'zod';

export const importableEntitySchema = z.enum(['companies', 'contacts', 'leads']);
export type ImportableEntity = z.infer<typeof importableEntitySchema>;

export const importPreviewSchema = z.object({
  // Las filas llegan como texto tal cual salieron del CSV; el schema de cada entidad las valida.
  rows: z.array(z.record(z.string(), z.string())).max(1000, 'Máximo 1000 filas por importación'),
});

export type ImportRowStatus = 'NEW' | 'DUPLICATE' | 'INVALID';

export interface ImportRowResult {
  index: number;
  status: ImportRowStatus;
  message: string | null;
  data: Record<string, string>;
}

export interface ImportPreviewDTO {
  rows: ImportRowResult[];
  summary: { new: number; duplicate: number; invalid: number };
}
```

Exportalo en el índice.

**Alcance:** solo `companies`, `contacts` y `leads`. El spec (sección 19) también lista Deals y Vendedores; deals dependen de resolver la empresa por nombre y vendedores implican crear credenciales, las dos cosas con reglas propias que no entran acá. Queda anotado en "Fuera del alcance".

- [ ] **Step 4: Escribir el servicio**

Creá `apps/api/src/modules/import/import.service.ts`:

```ts
import {
  createCompanySchema,
  createContactSchema,
  createLeadSchema,
  type ImportPreviewDTO,
  type ImportRowResult,
  type ImportableEntity,
} from '@ventry/shared';
import type { z } from 'zod';
import { CompaniesRepository } from '../companies/companies.repository.js';
import { ContactsRepository } from '../contacts/contacts.repository.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import type { Actor } from '../../lib/scope.js';

const SCHEMAS = {
  companies: createCompanySchema.omit({ confirmDuplicate: true }),
  contacts: createContactSchema.omit({ confirmDuplicate: true }),
  leads: createLeadSchema,
} as const;

// Devuelve el registro que ya existe, o null. Reusa exactamente la misma detección de duplicados
// que usan los formularios, así que importar y cargar a mano dan el mismo veredicto.
async function findDuplicate(entity: ImportableEntity, tenantId: string, data: Record<string, unknown>) {
  if (entity === 'companies') {
    return CompaniesRepository.findPossibleDuplicate(tenantId, {
      name: data.name as string,
      email: data.email as string | undefined,
      whatsapp: data.whatsapp as string | undefined,
    });
  }
  if (entity === 'contacts') {
    return ContactsRepository.findPossibleDuplicate(tenantId, {
      companyId: data.companyId as string,
      name: data.name as string,
      email: data.email as string | undefined,
      phone: data.phone as string | undefined,
      whatsapp: data.whatsapp as string | undefined,
    });
  }
  const existing = await LeadsRepository.findManyByTenant(tenantId);
  return existing.find((lead) => lead.businessName.toLowerCase() === String(data.businessName).toLowerCase()) ?? null;
}

export const ImportService = {
  async preview(actor: Actor, entity: ImportableEntity, rows: Record<string, string>[]): Promise<ImportPreviewDTO> {
    const schema = SCHEMAS[entity] as z.ZodTypeAny;
    const results: ImportRowResult[] = [];

    for (const [index, row] of rows.entries()) {
      const parsed = schema.safeParse(row);
      if (!parsed.success) {
        results.push({
          index,
          status: 'INVALID',
          message: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
          data: row,
        });
        continue;
      }
      const duplicate = await findDuplicate(entity, actor.tenantId, parsed.data);
      results.push({
        index,
        status: duplicate ? 'DUPLICATE' : 'NEW',
        message: duplicate ? 'Ya existe un registro parecido' : null,
        data: row,
      });
    }

    return {
      rows: results,
      summary: {
        new: results.filter((r) => r.status === 'NEW').length,
        duplicate: results.filter((r) => r.status === 'DUPLICATE').length,
        invalid: results.filter((r) => r.status === 'INVALID').length,
      },
    };
  },
};
```

`ponytail:` la detección de duplicados corre una consulta por fila. Con el tope de 1000 filas y una importación que pasa una vez por migración, es aceptable; si alguna vez se importan decenas de miles, hay que traer los candidatos de una sola consulta y comparar en memoria.

- [ ] **Step 5: Escribir las rutas y montarlas**

Creá `apps/api/src/modules/import/import.routes.ts`:

```ts
import { Router } from 'express';
import { importPreviewSchema, importableEntitySchema } from '@ventry/shared';
import { ImportService } from './import.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const importRouter = Router();

// Importar crea registros en masa para todo el tenant, incluidos los de otros vendedores. Es
// trabajo de migración, no de venta diaria.
importRouter.use(requireAuth, requireRole('ADMIN'));

importRouter.post('/:entity/preview', async (req, res, next) => {
  try {
    const entity = importableEntitySchema.safeParse(req.params.entity);
    if (!entity.success) throw new ValidationError('Entidad no importable');
    const body = importPreviewSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.message);
    res.json(await ImportService.preview(req.user!, entity.data, body.data.rows));
  } catch (err) {
    next(err);
  }
});
```

Montala con `app.use('/import', importRouter);`.

- [ ] **Step 6: Correr los tests**

Run: `npm run test -w @ventry/api -- import`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src apps/api/src
git commit -m "feat: add the import preview endpoint"
```

---

### Task 9: Importación — commit de las filas

**Esta es la tarea que se manda a revisar por un subagente independiente.** Es la única del plan que escribe muchos registros de una sola vez, y un error acá deja la base a medio migrar.

**Files:**
- Modify: `apps/api/src/modules/import/import.service.ts`, `import.routes.ts`
- Modify: `packages/shared/src/import.ts`
- Test: `apps/api/src/modules/import/import.routes.test.ts` (agregar casos)

**Interfaces:**
- Produces: `POST /import/:entity/commit` → `ImportCommitDTO`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregá al `describe` de import:

```ts
  it('creates only the rows the caller asked for', async () => {
    const res = await request(app)
      .post('/import/companies/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [
          { name: 'Una SAC', line: 'WEB' },
          { name: 'Otra SAC', line: 'SOFTWARE' },
        ],
        skipIndexes: [1],
      });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
    const names = (await prisma.company.findMany({ where: { tenantId } })).map((c) => c.name);
    expect(names).toEqual(['Una SAC']);
  });

  it('writes nothing at all when one row is invalid', async () => {
    const res = await request(app)
      .post('/import/companies/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [
          { name: 'Buena SAC', line: 'WEB' },
          { name: '', line: 'WEB' },
        ],
        skipIndexes: [],
      });
    expect(res.status).toBe(400);
    // Todo o nada: una importación a medias es peor que una que falla, porque nadie sabe qué entró.
    expect(await prisma.company.count({ where: { tenantId } })).toBe(0);
  });

  it('imports a duplicate when the caller kept it', async () => {
    await prisma.company.create({ data: { tenantId, name: 'Repetida SAC', line: 'WEB' } });
    const res = await request(app)
      .post('/import/companies/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ name: 'Repetida SAC', line: 'WEB' }], skipIndexes: [] });
    expect(res.status).toBe(201);
    expect(await prisma.company.count({ where: { tenantId } })).toBe(2);
  });

  it('records the import in the audit log', async () => {
    await request(app)
      .post('/import/companies/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ name: 'Auditada SAC', line: 'WEB' }], skipIndexes: [] });
    const logs = await prisma.auditLog.findMany({ where: { tenantId, action: 'CREATE' } });
    expect(logs.length).toBeGreaterThan(0);
  });
```

Ojo: el `beforeEach` tiene que limpiar también `auditLog`, y `AuditLog.userId` referencia a `User` — creá un usuario real en `beforeAll` y firmá `token` con su id, como se hizo en los tests de companies de Plan 3.

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm run test -w @ventry/api -- import`
Expected: FAIL con 404 en `/commit`.

- [ ] **Step 3: Agregar el schema del commit**

En `packages/shared/src/import.ts`:

```ts
export const importCommitSchema = importPreviewSchema.extend({
  /** Índices de fila que el usuario desmarcó en la vista previa (duplicados que no quiere traer). */
  skipIndexes: z.array(z.number().int().min(0)).default([]),
});

export interface ImportCommitDTO {
  created: number;
}
```

- [ ] **Step 4: Escribir el commit en el servicio**

Agregá a `ImportService`:

```ts
  async commit(
    actor: Actor,
    entity: ImportableEntity,
    rows: Record<string, string>[],
    skipIndexes: number[]
  ): Promise<ImportCommitDTO> {
    const skip = new Set(skipIndexes);
    const schema = SCHEMAS[entity] as z.ZodTypeAny;

    // Se valida TODO antes de escribir nada. Validar y escribir fila por fila dejaría la mitad de
    // la migración adentro y la otra mitad afuera, que es el peor estado posible: nadie sabe qué
    // entró y volver a correr el archivo duplica lo que sí pasó.
    const toCreate: Record<string, unknown>[] = [];
    for (const [index, row] of rows.entries()) {
      if (skip.has(index)) continue;
      const parsed = schema.safeParse(row);
      if (!parsed.success) {
        throw new ValidationError(
          `Fila ${index + 1}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
        );
      }
      toCreate.push(parsed.data);
    }

    // Una sola transacción para todas las filas: o entra el archivo entero, o no entra nada.
    const created = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const data of toCreate) {
        if (entity === 'companies') {
          const company = await CompaniesRepository.create({ tenantId: actor.tenantId, ...(data as never) }, tx);
          ids.push(company.id);
        } else if (entity === 'contacts') {
          const contact = await ContactsRepository.create({ tenantId: actor.tenantId, ...(data as never) }, tx);
          ids.push(contact.id);
        } else {
          const lead = await LeadsRepository.create({ tenantId: actor.tenantId, ...(data as never) }, tx);
          ids.push(lead.id);
        }
      }
      return ids;
    });

    // La auditoría va fuera de la transacción y a propósito: recordAudit se traga sus errores para
    // no tumbar la operación, así que meterlo adentro haría que un fallo de log dejase filas
    // huérfanas de auditoría igual, pero encima alargando la transacción.
    const entityType = entity === 'companies' ? 'COMPANY' : entity === 'contacts' ? 'CONTACT' : 'LEAD';
    for (const id of created) {
      await recordAudit(actor, { action: 'CREATE', entityType, entityId: id, after: { imported: true } });
    }

    return { created: created.length };
  },
```

`CompaniesRepository.create` y `ContactsRepository.create` ya aceptan un `Prisma.TransactionClient` opcional desde Plan 2. **`LeadsRepository.create` no** — agregale el mismo segundo parámetro `client: Prisma.TransactionClient = prisma`, igual que los otros dos.

- [ ] **Step 5: Agregar la ruta**

```ts
importRouter.post('/:entity/commit', async (req, res, next) => {
  try {
    const entity = importableEntitySchema.safeParse(req.params.entity);
    if (!entity.success) throw new ValidationError('Entidad no importable');
    const body = importCommitSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.message);
    res.status(201).json(await ImportService.commit(req.user!, entity.data, body.data.rows, body.data.skipIndexes));
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 6: Correr toda la suite**

Run: `npm run test -w @ventry/api`
Expected: PASS.

- [ ] **Step 7: Commit y despachar la revisión**

```bash
git add packages/shared/src apps/api/src
git commit -m "feat: commit imported rows in a single all-or-nothing transaction"
```

Después del commit, despachá **una** revisión de subagente independiente sobre el diff de esta tarea, pidiéndole específicamente: ¿puede quedar una importación a medias?; ¿el `tenantId` se toma siempre del JWT y nunca de una columna del CSV?; ¿`skipIndexes` puede sacar de rango o saltear la validación?; ¿el tope de 1000 filas alcanza para que la transacción no dé timeout con el default de Prisma (5s)?

---

### Task 10: Importación — frontend

**Files:**
- Modify: `apps/web/package.json` (agregar `papaparse`)
- Create: `apps/web/src/hooks/useImport.ts`
- Create: `apps/web/src/pages/ImportPage.tsx`
- Modify: `apps/web/src/routes/router.tsx`, `apps/web/src/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes: `POST /import/:entity/preview` y `/commit`.

- [ ] **Step 1: Instalar el parser**

```bash
npm install papaparse@^5.4.1 -w @ventry/web
npm install -D @types/papaparse@^5.3.14 -w @ventry/web
```

Serializar CSV se hizo a mano en la Tarea 7 porque son quince líneas. Parsearlo no: comillas embebidas, comas dentro de comillas, saltos de línea dentro de una celda y CRLF mezclado con LF son exactamente donde un parser casero falla con los archivos reales que salen de Excel, y el archivo lo trae el usuario.

- [ ] **Step 2: Escribir el hook**

Creá `apps/web/src/hooks/useImport.ts` con dos mutaciones: `usePreviewImport()` (`POST /import/${entity}/preview`, devuelve `ImportPreviewDTO`) y `useCommitImport()` (`POST /import/${entity}/commit`, invalida las queries de la entidad importada al terminar).

- [ ] **Step 3: Escribir la página**

Creá `apps/web/src/pages/ImportPage.tsx` con este flujo:

1. Un `<select>` de entidad (Empresas / Contactos / Leads) y un `<input type="file" accept=".csv,text/csv">`.
2. Al elegir archivo, parsear con `Papa.parse(file, { header: true, skipEmptyLines: true })` y guardar las filas.
3. Mandarlas a `preview` y mostrar la tabla de resultados: número de fila, estado (chip verde «Nueva», ámbar «Duplicada», rojo «Inválida»), el mensaje y las primeras columnas. Arriba, el resumen: «12 nuevas · 3 duplicadas · 1 inválida».
4. Un checkbox por fila duplicada para decidir si se importa igual — **las duplicadas arrancan desmarcadas** (lo esperable al migrar es no volver a crear lo que ya está) y las nuevas marcadas. Las inválidas no se pueden marcar.
5. Botón «Importar N filas», deshabilitado si hay alguna inválida marcada o si no queda ninguna fila. Al confirmar, `commit` con `skipIndexes` = los índices desmarcados, y mostrar «Se importaron N registros».

Mostrar el nombre del archivo y un botón para empezar de nuevo. Registrar la ruta `/import` y agregar la entrada al sidebar (`{ to: '/import', label: 'Importar', icon: Upload }`), **solo para ADMIN**, igual que Auditoría.

- [ ] **Step 4: Verificar build y tests**

Run: `npm run build && npm test`
Expected: exit 0, todo verde.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json package-lock.json apps/web/src
git commit -m "feat: add the CSV import page with a preview step"
```

---

### Task 11: Dashboard operativo

**Files:**
- Create: `packages/shared/src/dashboard.ts`
- Create: `apps/api/src/modules/dashboard/dashboard.service.ts`, `dashboard.routes.ts`
- Test: `apps/api/src/modules/dashboard/dashboard.routes.test.ts`
- Create: `apps/web/src/hooks/useDashboard.ts`, `apps/web/src/components/StatTile.tsx`
- Modify: `apps/web/src/routes/router.tsx` (reemplazar el placeholder del índice), `packages/shared/src/index.ts`, `apps/api/src/app.ts`, `packages/shared/src/deals.ts`

**Interfaces:**
- Produces: `DEAL_STAGE_GROUPS` y `DashboardDTO` en `@ventry/shared`; `GET /dashboard`.

- [ ] **Step 1: Fijar la definición de ganado/activo/perdido en un solo lugar**

Agregá a `packages/shared/src/deals.ts`:

```ts
// El pipeline no tiene etapa "Ganado", así que hay que definir qué cuenta como tal. Se toma el
// momento en que el cliente pone plata: del adelanto en adelante el deal está ganado, antes está
// todavía en juego. Cambiar esta línea cambia el dashboard entero, que es justamente la idea.
export const DEAL_STAGE_GROUPS = {
  active: ['CONTACTO', 'PROPUESTA', 'NEGOCIACION'],
  won: ['ADELANTO', 'PRODUCCION', 'ENTREGADO', 'MANTENIMIENTO'],
  lost: ['PERDIDO'],
} as const satisfies Record<string, readonly z.infer<typeof dealStageSchema>[]>;
```

- [ ] **Step 2: Escribir el test que falla**

Creá `apps/api/src/modules/dashboard/dashboard.routes.test.ts`. Casos: rechaza sin autenticar; con un deal en `NEGOCIACION` (PEN 1000) y otro en `ENTREGADO` (USD 500) devuelve `dealsActive: 1`, `dealsWon: 1` y `wonAmount: { PEN: '0', USD: '500' }`; **nunca suma PEN con USD**; una tarea vencida cuenta en `tasksOverdue`; y un `VENDEDOR` solo ve sus propios números.

- [ ] **Step 3: Escribir el servicio**

`apps/api/src/modules/dashboard/dashboard.service.ts` devuelve, todo scopeado por `tenantId` + `ownerFilter(actor)`:

```ts
export interface DashboardDTO {
  leadsNew: number;
  dealsActive: number;
  dealsWon: number;
  dealsLost: number;
  wonAmount: { PEN: string; USD: string };
  activeAmount: { PEN: string; USD: string };
  clientsActive: number;
  tasksUpcoming: number;
  tasksOverdue: number;
}
```

Implementación: `Promise.all` de `count` de Prisma para los contadores, y **dos** `groupBy({ by: ['currency'], _sum: { amount: true } })` para los montos — uno para `won` y otro para `active`, cada uno filtrado por su grupo de etapas. Los `_sum` vienen como `Decimal`, así que van al DTO con `.toString()`, y una moneda sin deals devuelve `'0'`, no `null`.

`tasksOverdue` = tareas del actor con `done: false` y `dueDate` menor a la medianoche UTC de hoy; `tasksUpcoming` = `done: false` y `dueDate` mayor o igual. El corte se calcula igual que en `apps/web/src/lib/date.ts`: `new Date(Date.UTC(y, m, d))` sobre la fecha local, porque las fechas de vencimiento se guardan como medianoche UTC.

**MRR no se calcula**: no hay ingreso recurrente modelado. No inventar un número.

- [ ] **Step 4: Escribir la ruta**

`GET /dashboard` con `requireAuth`, devolviendo `DashboardDTO`. Sin `requireRole`: el spec pide una vista para admin y otra para vendedor, y el scoping ya hace que cada uno vea los suyos — es el mismo endpoint con distinto alcance, no dos endpoints.

- [ ] **Step 5: Escribir el frontend**

`StatTile.tsx`: una card blanca con el número grande y la etiqueta chica en mayúsculas, que es el lenguaje visual de las imágenes de referencia y del sistema de diseño de Plan 1.

Reemplazá `{ index: true, element: <div>Dashboard (próximamente)</div> }` en el router por `<DashboardPage />`, que arma una grilla de tiles: Leads nuevos, Deals activos, Deals ganados, Deals perdidos, Clientes activos, Tareas próximas y Tareas vencidas (esta última en rojo si es mayor que cero). Debajo, dos tiles de monto por moneda — **PEN y USD siempre separados, nunca un total combinado** — con `formatMoney`. El título cambia según el rol: «Resumen del equipo» para ADMIN, «Mi resumen» para VENDEDOR, leyendo `useSession()`.

- [ ] **Step 6: Verificar build y tests**

Run: `npm run build && npm test`
Expected: exit 0, todo verde.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src apps/api/src apps/web/src
git commit -m "feat: add the operational dashboard"
```

---

## Verificación manual final (después de las 11 tareas)

1. Buscar «ABC» en la topbar: aparecen empresa, contacto, lead, deal y vendedor, y un clic navega.
2. Filtrar deals por etapa y por moneda; comprobar que el tablero cambia y que «Limpiar filtros» vuelve atrás.
3. Exportar deals con un filtro activo y abrir el CSV: acentos correctos, y solo las filas filtradas.
4. Importar un CSV de empresas con una fila válida, una duplicada y una con la línea mal escrita: la vista previa las clasifica bien, la duplicada viene desmarcada, y confirmar crea solo lo marcado.
5. Importar un CSV con una fila inválida marcada: falla entero y **no entra ninguna fila**.
6. Abrir Auditoría y ver las filas de la importación, más los cambios de etapa y reasignaciones de Plan 3.
7. Entrar como vendedor: el dashboard muestra solo sus números, y **Auditoría e Importar no aparecen en el sidebar**.
8. Consola del navegador sin errores más allá del warning conocido de React Router v7.

## Fuera del alcance de este plan

- **Importar Deals y Vendedores.** El spec (sección 19) los lista, pero un deal necesita resolver su empresa por nombre y un vendedor necesita credenciales — las dos cosas tienen reglas propias que merecen su propia tarea.
- **MRR en el dashboard**, hasta que exista un modelo de ingreso recurrente.
- **Excel (.xlsx)** para importar y exportar. CSV cubre la migración y Excel lo abre y lo genera nativamente.
- **Paginación** de la auditoría y de las listas filtradas. Hoy la auditoría corta en 200 filas y las listas devuelven todo.
- **Auditoría detallada campo por campo**: el spec (sección 25) la deja explícitamente para F3.
