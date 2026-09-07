# Plan 3 — Deals, Pipeline, Asignación y Tareas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Deals module with a drag-and-drop pipeline board, seller assignment with history, the "próximo paso" rule, and the Tareas module — and close the ownership gap left by Plan 2, where any authenticated user could see every tenant record regardless of who it was assigned to.

**Architecture:** Same layered pattern as `companies`/`contacts`/`leads`: `routes → service → repository`, every repository query scoped by `tenantId` from the JWT, Zod schemas shared through `packages/shared`, errors mapped by the central error middleware in `apps/api/src/app.ts`. Task 2 adds a second scoping axis on top of `tenantId`: an **owner filter**, so a `VENDEDOR` sees only records assigned to them while an `ADMIN` sees everything. Three new Prisma models (`Deal`, `Task`, `AssignmentHistory`) in one migration. One new frontend dependency (`@dnd-kit/core`) for the pipeline board — the first added since Plan 1, approved by the user for this plan.

**Tech Stack:** Node/Express/TypeScript/Prisma (`apps/api`), React/TypeScript/Vite/Tailwind (`apps/web`), Zod (`packages/shared`), Vitest + Supertest for backend tests, Vitest + Testing Library for frontend hook tests, `@dnd-kit/core` for the pipeline board.

**Spec:** `docs/superpowers/specs/2026-09-05-ventry-crm-mvp-design.md` (arquitectura: modelos `Deal`, `Task`, `AssignmentHistory` en la sección B, regla de dinero en la sección B) y `roult-crm-mvp-y-roadmap-v2-vendedores.md` secciones 12 (permisos por rol), 14 (Deal), 16 (regla de próximo paso), 22 (pipeline y motivo de pérdida).

## Global Constraints

- **Copiado verbatim del spec de negocio, sección 22 — el pipeline es exactamente este, en este orden:** `Contacto → Propuesta/Maqueta → Negociación → Adelanto → Producción → Entregado → Mantenimiento`, más `Perdido` fuera de la secuencia. Los deals perdidos **nunca deben eliminarse**. Al marcar un deal como perdido **debe solicitarse el motivo de pérdida**.
- **Copiado verbatim del spec técnico:** los valores del enum `DealStage` son `CONTACTO`|`PROPUESTA`|`NEGOCIACION`|`ADELANTO`|`PRODUCCION`|`ENTREGADO`|`MANTENIMIENTO`|`PERDIDO`.
- **Dinero:** siempre `{ amount: Decimal, currency: PEN|USD }`, nunca un campo numérico suelto. Nunca se suman montos de distinta moneda. En los DTO el monto viaja como `string` (no `number`) para no perder precisión al serializar un `Decimal` a JSON.
- **Permisos (spec de negocio, sección 12):** un `ADMIN` ve y gestiona todo dentro de su tenant. Un `VENDEDOR` solo ve sus leads, sus clientes asignados, sus deals y sus tareas. Asignar/reasignar es exclusivo de `ADMIN`.
- Todo modelo nuevo lleva un campo `tenantId String` pelado + `@@index([tenantId])`, **sin** `@relation` a `Tenant` — precedente aprobado en la revisión final de Plan 1 para `RefreshToken.tenantId` y usado en todo Plan 2.
- Los imports llevan extensión `.js` en todos lados (ESM + `moduleResolution: Bundler`), como cada archivo existente de `apps/api` y `apps/web`.
- Los campos de texto opcionales usan el helper `optionalText()` de `packages/shared/src/common.ts` (agregado al final de Plan 2): un input HTML sin tocar manda `""`, y `optionalText` lo convierte a `undefined` antes de validar. **Nunca uses `z.string().optional()` pelado para un campo que se llena desde un formulario.**
- Los mensajes de validación de campos obligatorios van en español, porque se muestran tal cual en los diálogos (`{err.message}`).
- Convención de tests del frontend, establecida en Plan 1 y mantenida en Plan 2: un test de Vitest por hook de datos (mockeando `apiClient`), sin tests automatizados de diálogos ni páginas — esos se verifican a mano en el navegador al terminar todas las tareas.
- **Proceso de ejecución de este plan (más liviano que Plan 1, igual que Plan 2):** revisá vos mismo, inline, las Tareas 1 y 3–10. Despachá exactamente **una** revisión de subagente independiente para la **Tarea 2** (scoping por dueño), porque es la única con consecuencias de seguridad: un filtro mal puesto ahí es una fuga de datos entre vendedores. No corras una revisión final de todo el branch salvo que la revisión de la Tarea 2 (o cualquier otra cosa en el camino) levante una preocupación de seguridad o concurrencia.
- Al terminar las 9 tareas: verificación manual en navegador de todo el plan (arrastrar deals entre etapas, motivo de pérdida, asignación, tareas vencidas), igual que se hizo en Plan 1 y Plan 2.

---

### Task 1: Prisma schema — Deal, Task y AssignmentHistory

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_deals_tasks_assignments/` (generada por Prisma, no escrita a mano)

**Interfaces:**
- Produces: modelos Prisma `Deal`, `Task`, `AssignmentHistory` y enums `Currency` (`PEN`|`USD`), `DealStage` (los 8 valores de las Global Constraints) y `RelatedType` (`LEAD`|`COMPANY`|`DEAL`). Todos los nombres de campo de abajo son de los que dependen las tareas siguientes.

No hay lógica de aplicación en esta tarea (schema + migración pura), así que no hay ciclo TDD: la Tarea 3 ejercita el schema contra un Postgres real y fallaría de inmediato si un campo estuviera mal.

- [ ] **Step 1: Agregar los enums y modelos a `schema.prisma`**

Agregá al final de `apps/api/prisma/schema.prisma` (después del modelo `Lead`):

```prisma
enum Currency {
  PEN
  USD
}

enum DealStage {
  CONTACTO
  PROPUESTA
  NEGOCIACION
  ADELANTO
  PRODUCCION
  ENTREGADO
  MANTENIMIENTO
  PERDIDO
}

enum RelatedType {
  LEAD
  COMPANY
  DEAL
}

model Deal {
  id                  String    @id @default(uuid())
  tenantId            String
  companyId           String
  company             Company   @relation(fields: [companyId], references: [id])
  title               String
  amount              Decimal   @db.Decimal(12, 2)
  currency            Currency
  stage               DealStage @default(CONTACTO)
  assignedUserId      String?
  expectedCloseDate   DateTime?
  lostReason          String?
  nextStepDescription String?
  nextStepOwnerId     String?
  nextStepDate        DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  @@index([tenantId])
  @@index([tenantId, stage])
  @@index([tenantId, assignedUserId])
  @@index([companyId])
}

model Task {
  id          String       @id @default(uuid())
  tenantId    String
  title       String
  description String?
  ownerId     String
  relatedType RelatedType?
  relatedId   String?
  dueDate     DateTime
  done        Boolean      @default(false)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([tenantId])
  @@index([tenantId, ownerId, done])
}

model AssignmentHistory {
  id             String      @id @default(uuid())
  tenantId       String
  entityType     RelatedType
  entityId       String
  previousUserId String?
  newUserId      String?
  changedById    String
  changedAt      DateTime    @default(now())

  @@index([tenantId, entityType, entityId])
}
```

Y agregá la relación inversa al modelo `Company` existente, dentro de su bloque de relaciones (queda junto a `contacts` y `convertedFromLeads`):

```prisma
  deals              Deal[]
```

- [ ] **Step 2: Generar la migración y el cliente**

```bash
cd apps/api && npx prisma migrate dev --name add_deals_tasks_assignments
```

Esperado: crea `prisma/migrations/<timestamp>_add_deals_tasks_assignments/migration.sql`, la aplica al Postgres de pruebas (puerto 55432, levantado con `docker compose up -d db-test`) y regenera `@prisma/client`.

Nota sobre `AssignmentHistory.newUserId`: es nullable a propósito. Desasignar un deal (dejarlo sin vendedor) es una reasignación válida que también hay que registrar.

- [ ] **Step 3: Verificar que el cliente compila con los tipos nuevos**

```bash
npm run build -w @ventry/api
```

Esperado: exit 0. Si el enum `DealStage` estuviera mal escrito, la Tarea 3 no compilaría.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add Deal, Task and AssignmentHistory models"
```

---

### Task 2: Scoping por dueño — un VENDEDOR solo ve lo suyo

Esta es la tarea con consecuencias de seguridad del plan. El spec de negocio (sección 12) dice que un `VENDEDOR` ve "sus leads, sus clientes asignados, sus deals". Plan 2 no lo implementó: hoy `GET /leads`, `GET /companies` y `GET /contacts` devuelven todo lo del tenant a cualquier usuario autenticado. Esta tarea agrega ese segundo eje de filtrado **antes** de que los Deals se construyan encima, para que el módulo nuevo nazca con la regla puesta.

**Files:**
- Create: `apps/api/src/lib/scope.ts`
- Create: `apps/api/src/lib/scope.test.ts`
- Modify: `apps/api/src/modules/companies/companies.repository.ts`
- Modify: `apps/api/src/modules/companies/companies.service.ts`
- Modify: `apps/api/src/modules/companies/companies.routes.ts`
- Modify: `apps/api/src/modules/contacts/contacts.repository.ts`
- Modify: `apps/api/src/modules/contacts/contacts.service.ts`
- Modify: `apps/api/src/modules/contacts/contacts.routes.ts`
- Modify: `apps/api/src/modules/leads/leads.repository.ts`
- Modify: `apps/api/src/modules/leads/leads.service.ts`
- Modify: `apps/api/src/modules/leads/leads.routes.ts`
- Test: `apps/api/src/modules/leads/leads.routes.test.ts` (agregar casos)
- Test: `apps/api/src/modules/companies/companies.routes.test.ts` (agregar casos)

**Interfaces:**
- Consumes: `req.user` (tipo `AccessTokenPayload` de `apps/api/src/lib/tokens.js`, con `userId`, `tenantId`, `role`), ya poblado por `requireAuth`.
- Produces:
  - `export interface Actor { userId: string; tenantId: string; role: 'ADMIN' | 'VENDEDOR' }`
  - `export function ownerFilter(actor: Actor): { assignedUserId?: string }` — `{}` para ADMIN, `{ assignedUserId: actor.userId }` para VENDEDOR. Las tareas 3–5 lo usan tal cual.
  - `export function defaultAssignee(actor: Actor, requested?: string): string | undefined` — a quién asignar un registro recién creado.
  - Las firmas de servicio de leads/companies/contacts pasan de `(tenantId: string, ...)` a `(actor: Actor, ...)`. La Tarea 3 copia esa forma para deals.

- [ ] **Step 1: Escribir el test que falla, para el helper de scoping**

Creá `apps/api/src/lib/scope.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -w @ventry/api -- scope`
Expected: FAIL, `Failed to load .../lib/scope.js` (el archivo todavía no existe).

- [ ] **Step 3: Escribir el helper**

Creá `apps/api/src/lib/scope.ts`:

```ts
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
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test -w @ventry/api -- scope`
Expected: PASS, 5 tests.

- [ ] **Step 5: Aplicar el filtro en el repositorio de leads**

En `apps/api/src/modules/leads/leads.repository.ts`, reemplazá `findManyByTenant` y `findByIdAndTenant`:

```ts
  findManyByTenant(tenantId: string, owner: { assignedUserId?: string } = {}) {
    return prisma.lead.findMany({ where: { tenantId, ...owner }, orderBy: { createdAt: 'desc' } });
  },

  findByIdAndTenant(id: string, tenantId: string, owner: { assignedUserId?: string } = {}) {
    return prisma.lead.findFirst({ where: { id, tenantId, ...owner } });
  },
```

El default `= {}` mantiene compilando a los llamadores internos que no representan un request de usuario (la conversión de lead, por ejemplo, ya validó el acceso antes).

- [ ] **Step 6: Pasar el `Actor` por el servicio de leads**

En `apps/api/src/modules/leads/leads.service.ts`, importá el helper y cambiá las firmas públicas:

```ts
import { ownerFilter, defaultAssignee, type Actor } from '../../lib/scope.js';
```

```ts
  async list(actor: Actor): Promise<LeadDTO[]> {
    const leads = await LeadsRepository.findManyByTenant(actor.tenantId, ownerFilter(actor));
    return leads.map(toDTO);
  },

  async create(actor: Actor, input: z.infer<typeof createLeadSchema>): Promise<LeadDTO> {
    const lead = await LeadsRepository.create({
      tenantId: actor.tenantId,
      businessName: input.businessName,
      contactName: input.contactName,
      phone: input.phone,
      whatsapp: input.whatsapp,
      email: input.email,
      line: input.line,
      source: input.source,
      assignedUserId: defaultAssignee(actor, input.assignedUserId),
      notes: input.notes,
    });
    return toDTO(lead);
  },
```

Para `update`, `setStatus` y `convert`, reemplazá cada `(tenantId: string, id: string, ...)` por `(actor: Actor, id: string, ...)` y cada búsqueda de existencia por la versión scopeada. El patrón, aplicado a `update`:

```ts
  async update(actor: Actor, id: string, input: z.infer<typeof updateLeadSchema>): Promise<LeadDTO> {
    const existing = await LeadsRepository.findByIdAndTenant(id, actor.tenantId, ownerFilter(actor));
    if (!existing) throw new NotFoundError('Lead not found');
    if (input.assignedUserId !== undefined && actor.role !== 'ADMIN') {
      throw new ForbiddenError('Solo un administrador puede reasignar un lead');
    }
    await LeadsRepository.updateByIdAndTenant(id, actor.tenantId, input);
    const updated = await LeadsRepository.findByIdAndTenant(id, actor.tenantId);
    return toDTO(updated!);
  },
```

Agregá `ForbiddenError` a los imports de `../../lib/errors.js` en ese archivo. Devolver `NotFoundError` (no `ForbiddenError`) cuando el registro existe pero es de otro vendedor es deliberado: no le confirma a un vendedor que el id de otro existe.

Dentro de `convert`, la búsqueda inicial usa `ownerFilter(actor)`; las llamadas de adentro de la transacción (`CompaniesRepository.create`, `ContactsRepository.create`, `LeadsRepository.markConverted`) siguen igual, y la Empresa creada hereda el dueño del lead: `assignedUserId: lead.assignedUserId`, que ya es lo que hace hoy.

- [ ] **Step 7: Pasar el `Actor` desde las rutas de leads**

En `apps/api/src/modules/leads/leads.routes.ts`, cambiá cada `req.user!.tenantId` por `req.user!`:

```ts
const leads = await LeadsService.list(req.user!);
```
```ts
const lead = await LeadsService.create(req.user!, parsed.data);
```
```ts
const lead = await LeadsService.update(req.user!, req.params.id, parsed.data);
```
```ts
const lead = await LeadsService.setStatus(req.user!, req.params.id, parsed.data.status);
```
```ts
const result = await LeadsService.convert(req.user!, req.params.id, parsed.data.confirmDuplicate ?? false);
```

- [ ] **Step 8: Repetir en companies y contacts**

`companies`: mismo cambio exacto que leads — `findManyByTenant`/`findByIdAndTenant` toman el `owner` opcional, el servicio toma `Actor`, `create` usa `defaultAssignee`, `update` rechaza el cambio de `assignedUserId` si el actor no es `ADMIN`, y las rutas pasan `req.user!`.

`contacts` es el caso distinto: un `Contact` **no tiene** `assignedUserId` propio, pertenece a una `Company`. Su filtro va por la empresa dueña. En `apps/api/src/modules/contacts/contacts.repository.ts`:

```ts
  findManyByTenant(tenantId: string, owner: { assignedUserId?: string } = {}) {
    return prisma.contact.findMany({
      where: { tenantId, ...(owner.assignedUserId ? { company: { assignedUserId: owner.assignedUserId } } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { company: { select: { name: true } } },
    });
  },

  findByIdAndTenant(id: string, tenantId: string, owner: { assignedUserId?: string } = {}) {
    return prisma.contact.findFirst({
      where: { id, tenantId, ...(owner.assignedUserId ? { company: { assignedUserId: owner.assignedUserId } } : {}) },
      include: { company: { select: { name: true } } },
    });
  },
```

Mantené el `include` tal como esté hoy en el archivo — el `ContactDTO` expone `companyName` y se rompe si lo sacás. Además, en `ContactsService.create`, la validación de que la empresa existe tiene que usar la versión scopeada de `CompaniesRepository.findByIdAndTenant`, para que un vendedor no pueda colgarle un contacto a la empresa de otro:

```ts
const company = await CompaniesRepository.findByIdAndTenant(input.companyId, actor.tenantId, ownerFilter(actor));
if (!company) throw new NotFoundError('Company not found');
```

- [ ] **Step 9: Escribir los tests de aislamiento entre vendedores**

Agregá a `apps/api/src/modules/leads/leads.routes.test.ts`, dentro del `describe` existente:

```ts
  it('hides another vendedor’s leads from a vendedor', async () => {
    const sellerA = signAccessToken({ userId: 'seller-a', tenantId, role: 'VENDEDOR' });
    const sellerB = signAccessToken({ userId: 'seller-b', tenantId, role: 'VENDEDOR' });

    const created = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ businessName: 'Solo de A', contactName: 'Ana', line: 'WEB' });
    expect(created.status).toBe(201);
    expect(created.body.assignedUserId).toBe('seller-a');

    const listB = await request(app).get('/leads').set('Authorization', `Bearer ${sellerB}`);
    expect(listB.status).toBe(200);
    expect(listB.body.map((l: { id: string }) => l.id)).not.toContain(created.body.id);

    const patchB = await request(app)
      .patch(`/leads/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerB}`)
      .send({ notes: 'robado' });
    expect(patchB.status).toBe(404);
  });

  it('shows an admin every lead in the tenant', async () => {
    const sellerA = signAccessToken({ userId: 'seller-a', tenantId, role: 'VENDEDOR' });
    const created = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ businessName: 'Solo de A', contactName: 'Ana', line: 'WEB' });

    const listAdmin = await request(app).get('/leads').set('Authorization', `Bearer ${token}`);
    expect(listAdmin.body.map((l: { id: string }) => l.id)).toContain(created.body.id);
  });

  it('refuses to let a vendedor reassign a lead', async () => {
    const sellerA = signAccessToken({ userId: 'seller-a', tenantId, role: 'VENDEDOR' });
    const created = await request(app)
      .post('/leads')
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ businessName: 'Solo de A', contactName: 'Ana', line: 'WEB' });

    const res = await request(app)
      .patch(`/leads/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerA}`)
      .send({ assignedUserId: 'seller-b' });
    expect(res.status).toBe(403);
  });
```

Agregá el equivalente de los dos primeros a `companies.routes.test.ts`, creando la empresa con un token de `VENDEDOR` y verificando que otro vendedor no la ve en `GET /companies` y recibe 404 en `PATCH /companies/:id`.

- [ ] **Step 10: Correr toda la suite del backend**

Run: `npm run test -w @ventry/api`
Expected: PASS. Los tests que ya existían siguen pasando porque usan un token de `ADMIN`, para el que `ownerFilter` devuelve `{}`.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/lib/scope.ts apps/api/src/lib/scope.test.ts apps/api/src/modules
git commit -m "feat: scope leads, companies and contacts to their assigned vendedor"
```

---

### Task 3: Deals backend — CRUD y próximo paso

**Files:**
- Create: `packages/shared/src/deals.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/common.ts`
- Create: `apps/api/src/modules/deals/deals.repository.ts`
- Create: `apps/api/src/modules/deals/deals.service.ts`
- Create: `apps/api/src/modules/deals/deals.routes.ts`
- Test: `apps/api/src/modules/deals/deals.routes.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `Actor`, `ownerFilter`, `defaultAssignee` de la Tarea 2. `CompaniesRepository.findByIdAndTenant(id, tenantId, owner)`.
- Produces:
  - `createDealSchema`, `updateDealSchema`, `dealStageSchema`, `currencySchema`, `moneySchema`, `DealDTO` en `@ventry/shared`.
  - `DealsRepository` con `findManyByTenant`, `findByIdAndTenant`, `create`, `updateByIdAndTenant`.
  - `DealsService` con `list`, `create`, `update`.
  - `GET /deals`, `POST /deals`, `PATCH /deals/:id`. Las tareas 4, 6 y 7 dependen de estos nombres.

- [ ] **Step 1: Escribir el test que falla**

Creá `apps/api/src/modules/deals/deals.routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/deals routes', () => {
  const app = createApp();
  let tenantId: string;
  let companyId: string;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Deals Route Tenant' } })).id;
    token = signAccessToken({ userId: 'user-1', tenantId, role: 'ADMIN' });
  });

  afterAll(async () => {
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.company.deleteMany({ where: { tenantId } });
    companyId = (await prisma.company.create({ data: { tenantId, name: 'ABC SAC', line: 'WEB' } })).id;
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/deals');
    expect(res.status).toBe(401);
  });

  it('creates a deal in the first stage', async () => {
    const res = await request(app)
      .post('/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, title: 'Web corporativa', amount: '8000.00', currency: 'PEN' });
    expect(res.status).toBe(201);
    expect(res.body.stage).toBe('CONTACTO');
    expect(res.body.amount).toBe('8000');
    expect(res.body.currency).toBe('PEN');
    expect(res.body.companyName).toBe('ABC SAC');
  });

  it('rejects an amount that is not money', async () => {
    const res = await request(app)
      .post('/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, title: 'Web corporativa', amount: '8000.999', currency: 'PEN' });
    expect(res.status).toBe(400);
  });

  it('rejects a deal on a company from another tenant', async () => {
    const otherTenant = await prisma.tenant.create({ data: { name: 'Otro' } });
    const otherCompany = await prisma.company.create({
      data: { tenantId: otherTenant.id, name: 'Ajena', line: 'WEB' },
    });
    const res = await request(app)
      .post('/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId: otherCompany.id, title: 'X', amount: '1', currency: 'PEN' });
    expect(res.status).toBe(404);
    await prisma.company.delete({ where: { id: otherCompany.id } });
    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });

  it('saves the next step on a deal', async () => {
    const created = await request(app)
      .post('/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, title: 'Web corporativa', amount: '8000', currency: 'PEN' });
    const res = await request(app)
      .patch(`/deals/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        nextStepDescription: 'Llamar para confirmar propuesta',
        nextStepOwnerId: 'user-1',
        nextStepDate: '2026-09-08',
      });
    expect(res.status).toBe(200);
    expect(res.body.nextStepDescription).toBe('Llamar para confirmar propuesta');
    expect(res.body.nextStepDate).toBe('2026-09-08T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -w @ventry/api -- deals`
Expected: FAIL, `Cannot find module './modules/deals/deals.routes.js'`.

- [ ] **Step 3: Agregar el schema de dinero a `common.ts`**

Agregá a `packages/shared/src/common.ts`:

```ts
export const currencySchema = z.enum(['PEN', 'USD']);
export type Currency = z.infer<typeof currencySchema>;

// El monto viaja como string, no como number: un Decimal(12,2) de Postgres no entra sin pérdida en
// un float de JS, y el input del formulario ya es un string. Se convierte a número solo para mostrar.
export const moneySchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Monto inválido (ej. 8000 o 8000.50)');
```

- [ ] **Step 4: Escribir los schemas de deal**

Creá `packages/shared/src/deals.ts`:

```ts
import { z } from 'zod';
import { currencySchema, moneySchema, optionalText } from './common.js';

export const dealStageSchema = z.enum([
  'CONTACTO',
  'PROPUESTA',
  'NEGOCIACION',
  'ADELANTO',
  'PRODUCCION',
  'ENTREGADO',
  'MANTENIMIENTO',
  'PERDIDO',
]);

export const createDealSchema = z.object({
  companyId: z.string().min(1, 'Selecciona una empresa'),
  title: z.string().min(1, 'Ingresa el título del deal'),
  amount: moneySchema,
  currency: currencySchema,
  assignedUserId: optionalText(z.string()),
  expectedCloseDate: optionalText(z.string().date()),
  nextStepDescription: optionalText(z.string()),
  nextStepOwnerId: optionalText(z.string()),
  nextStepDate: optionalText(z.string().date()),
});

export const updateDealSchema = createDealSchema.omit({ companyId: true }).partial();

export interface DealDTO {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  amount: string;
  currency: 'PEN' | 'USD';
  stage: z.infer<typeof dealStageSchema>;
  assignedUserId: string | null;
  expectedCloseDate: string | null;
  lostReason: string | null;
  nextStepDescription: string | null;
  nextStepOwnerId: string | null;
  nextStepDate: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Exportalo desde `packages/shared/src/index.ts` con la misma forma que las líneas que ya están ahí:

```ts
export * from './deals.js';
```

- [ ] **Step 5: Escribir el repositorio**

Creá `apps/api/src/modules/deals/deals.repository.ts`:

```ts
import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '@prisma/client';

const withCompany = { include: { company: { select: { name: true } } } } as const;

export const DealsRepository = {
  findManyByTenant(tenantId: string, owner: { assignedUserId?: string } = {}) {
    return prisma.deal.findMany({ where: { tenantId, ...owner }, orderBy: { createdAt: 'desc' }, ...withCompany });
  },

  findByIdAndTenant(id: string, tenantId: string, owner: { assignedUserId?: string } = {}) {
    return prisma.deal.findFirst({ where: { id, tenantId, ...owner }, ...withCompany });
  },

  create(data: Prisma.DealUncheckedCreateInput) {
    return prisma.deal.create({ data, ...withCompany });
  },

  updateByIdAndTenant(id: string, tenantId: string, data: Prisma.DealUpdateInput) {
    return prisma.deal.updateMany({ where: { id, tenantId }, data });
  },
};
```

- [ ] **Step 6: Escribir el servicio**

Creá `apps/api/src/modules/deals/deals.service.ts`:

```ts
import type { DealDTO, createDealSchema, updateDealSchema } from '@ventry/shared';
import type { z } from 'zod';
import type { Deal } from '@prisma/client';
import { DealsRepository } from './deals.repository.js';
import { CompaniesRepository } from '../companies/companies.repository.js';
import { UsersRepository } from '../users/users.repository.js';
import { NotFoundError, ForbiddenError } from '../../lib/errors.js';
import { ownerFilter, defaultAssignee, type Actor } from '../../lib/scope.js';

type DealWithCompany = Deal & { company: { name: string } };

export function toDTO(deal: DealWithCompany): DealDTO {
  return {
    id: deal.id,
    companyId: deal.companyId,
    companyName: deal.company.name,
    title: deal.title,
    amount: deal.amount.toString(),
    currency: deal.currency,
    stage: deal.stage,
    assignedUserId: deal.assignedUserId,
    expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
    lostReason: deal.lostReason,
    nextStepDescription: deal.nextStepDescription,
    nextStepOwnerId: deal.nextStepOwnerId,
    nextStepDate: deal.nextStepDate?.toISOString() ?? null,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
  };
}

async function assertUserInTenant(tenantId: string, userId?: string) {
  if (!userId) return;
  const user = await UsersRepository.findByIdAndTenant(userId, tenantId);
  if (!user) throw new NotFoundError('Assigned user not found');
}

export const DealsService = {
  async list(actor: Actor): Promise<DealDTO[]> {
    const deals = await DealsRepository.findManyByTenant(actor.tenantId, ownerFilter(actor));
    return deals.map(toDTO);
  },

  async create(actor: Actor, input: z.infer<typeof createDealSchema>): Promise<DealDTO> {
    const company = await CompaniesRepository.findByIdAndTenant(input.companyId, actor.tenantId, ownerFilter(actor));
    if (!company) throw new NotFoundError('Company not found');

    const assignedUserId = defaultAssignee(actor, input.assignedUserId);
    await assertUserInTenant(actor.tenantId, assignedUserId);
    await assertUserInTenant(actor.tenantId, input.nextStepOwnerId);

    const deal = await DealsRepository.create({
      tenantId: actor.tenantId,
      companyId: input.companyId,
      title: input.title,
      amount: input.amount,
      currency: input.currency,
      assignedUserId,
      expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : undefined,
      nextStepDescription: input.nextStepDescription,
      nextStepOwnerId: input.nextStepOwnerId,
      nextStepDate: input.nextStepDate ? new Date(input.nextStepDate) : undefined,
    });
    return toDTO(deal);
  },

  async update(actor: Actor, id: string, input: z.infer<typeof updateDealSchema>): Promise<DealDTO> {
    const existing = await DealsRepository.findByIdAndTenant(id, actor.tenantId, ownerFilter(actor));
    if (!existing) throw new NotFoundError('Deal not found');
    if (input.assignedUserId !== undefined && actor.role !== 'ADMIN') {
      throw new ForbiddenError('Solo un administrador puede reasignar un deal');
    }
    await assertUserInTenant(actor.tenantId, input.nextStepOwnerId);

    await DealsRepository.updateByIdAndTenant(id, actor.tenantId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.assignedUserId !== undefined ? { assignedUserId: input.assignedUserId } : {}),
      ...(input.expectedCloseDate !== undefined ? { expectedCloseDate: new Date(input.expectedCloseDate) } : {}),
      ...(input.nextStepDescription !== undefined ? { nextStepDescription: input.nextStepDescription } : {}),
      ...(input.nextStepOwnerId !== undefined ? { nextStepOwnerId: input.nextStepOwnerId } : {}),
      ...(input.nextStepDate !== undefined ? { nextStepDate: new Date(input.nextStepDate) } : {}),
    });
    const updated = await DealsRepository.findByIdAndTenant(id, actor.tenantId);
    return toDTO(updated!);
  },
};
```

El objeto de update se arma campo por campo a propósito: `updateDealSchema` es `.partial()`, así que hacer un spread del input entero escribiría `undefined` en columnas que el cliente no mandó, y además dejaría pasar un `stage` o un `lostReason` sin la validación de la Tarea 4.

- [ ] **Step 7: Escribir las rutas**

Creá `apps/api/src/modules/deals/deals.routes.ts`:

```ts
import { Router } from 'express';
import { createDealSchema, updateDealSchema } from '@ventry/shared';
import { DealsService } from './deals.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const dealsRouter = Router();

dealsRouter.use(requireAuth);

dealsRouter.get('/', async (req, res, next) => {
  try {
    res.json(await DealsService.list(req.user!));
  } catch (err) {
    next(err);
  }
});

dealsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createDealSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.status(201).json(await DealsService.create(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});

dealsRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateDealSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await DealsService.update(req.user!, req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});
```

Y montalo en `apps/api/src/app.ts`, junto a los otros routers:

```ts
import { dealsRouter } from './modules/deals/deals.routes.js';
```
```ts
  app.use('/deals', dealsRouter);
```

- [ ] **Step 8: Correr los tests y verificar que pasan**

Run: `npm run test -w @ventry/api -- deals`
Expected: PASS, 5 tests.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src apps/api/src
git commit -m "feat: add Deals module with money and next-step fields"
```

---

### Task 4: Etapas del pipeline, motivo de pérdida y reasignación con historial

**Files:**
- Modify: `packages/shared/src/deals.ts`
- Modify: `apps/api/src/modules/deals/deals.repository.ts`
- Modify: `apps/api/src/modules/deals/deals.service.ts`
- Modify: `apps/api/src/modules/deals/deals.routes.ts`
- Test: `apps/api/src/modules/deals/deals.routes.test.ts` (agregar casos)

**Interfaces:**
- Consumes: todo lo de la Tarea 3.
- Produces: `setDealStageSchema`, `assignDealSchema` en `@ventry/shared`; `DealsService.setStage`, `DealsService.assign`; `PATCH /deals/:id/stage`, `PATCH /deals/:id/assign`. La Tarea 7 llama a los dos endpoints y la Tarea 8 al segundo.

- [ ] **Step 1: Escribir los tests que fallan**

Agregá a `apps/api/src/modules/deals/deals.routes.test.ts`, dentro del `describe`:

```ts
  async function createDeal(auth = token) {
    const res = await request(app)
      .post('/deals')
      .set('Authorization', `Bearer ${auth}`)
      .send({ companyId, title: 'Web corporativa', amount: '8000', currency: 'PEN' });
    return res.body;
  }

  it('moves a deal to another stage', async () => {
    const deal = await createDeal();
    const res = await request(app)
      .patch(`/deals/${deal.id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'NEGOCIACION' });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('NEGOCIACION');
  });

  it('refuses to mark a deal lost without a reason', async () => {
    const deal = await createDeal();
    const res = await request(app)
      .patch(`/deals/${deal.id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'PERDIDO' });
    expect(res.status).toBe(400);
  });

  it('marks a deal lost with a reason and keeps the record', async () => {
    const deal = await createDeal();
    const res = await request(app)
      .patch(`/deals/${deal.id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'PERDIDO', lostReason: 'Precio fuera de presupuesto' });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('PERDIDO');
    expect(res.body.lostReason).toBe('Precio fuera de presupuesto');

    const list = await request(app).get('/deals').set('Authorization', `Bearer ${token}`);
    expect(list.body.map((d: { id: string }) => d.id)).toContain(deal.id);
  });

  it('clears the lost reason when a lost deal is reopened', async () => {
    const deal = await createDeal();
    await request(app)
      .patch(`/deals/${deal.id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'PERDIDO', lostReason: 'Precio' });
    const res = await request(app)
      .patch(`/deals/${deal.id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'NEGOCIACION' });
    expect(res.body.stage).toBe('NEGOCIACION');
    expect(res.body.lostReason).toBeNull();
  });

  it('records an assignment change in the history', async () => {
    const seller = await prisma.user.create({
      data: {
        tenantId,
        email: `vendedor-${Date.now()}@roult.pe`,
        passwordHash: 'x',
        firstName: 'Juan',
        lastName: 'Pérez',
        role: 'VENDEDOR',
      },
    });
    const deal = await createDeal();

    const res = await request(app)
      .patch(`/deals/${deal.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assignedUserId: seller.id });
    expect(res.status).toBe(200);
    expect(res.body.assignedUserId).toBe(seller.id);

    const history = await prisma.assignmentHistory.findMany({ where: { tenantId, entityId: deal.id } });
    expect(history).toHaveLength(1);
    expect(history[0].previousUserId).toBeNull();
    expect(history[0].newUserId).toBe(seller.id);
    expect(history[0].changedById).toBe('user-1');

    await prisma.assignmentHistory.deleteMany({ where: { tenantId } });
    await prisma.user.delete({ where: { id: seller.id } });
  });

  it('refuses to let a vendedor assign a deal', async () => {
    const deal = await createDeal();
    const sellerToken = signAccessToken({ userId: 'seller-a', tenantId, role: 'VENDEDOR' });
    const res = await request(app)
      .patch(`/deals/${deal.id}/assign`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ assignedUserId: 'seller-a' });
    expect(res.status).toBe(403);
  });
```

Agregá `await prisma.assignmentHistory.deleteMany({ where: { tenantId } });` al `afterAll`, antes del borrado de deals.

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test -w @ventry/api -- deals`
Expected: FAIL con 404 en los PATCH nuevos (las rutas `/stage` y `/assign` todavía no existen).

- [ ] **Step 3: Agregar los schemas**

Agregá a `packages/shared/src/deals.ts`:

```ts
// El motivo de pérdida es obligatorio al marcar PERDIDO (spec de negocio, sección 22) y no aplica
// a ninguna otra etapa, así que la regla vive en el schema y no en el servicio.
export const setDealStageSchema = z
  .object({
    stage: dealStageSchema,
    lostReason: optionalText(z.string()),
  })
  .refine((v) => v.stage !== 'PERDIDO' || !!v.lostReason, {
    message: 'Indica el motivo de pérdida',
    path: ['lostReason'],
  });

export const assignDealSchema = z.object({
  assignedUserId: optionalText(z.string()),
});
```

- [ ] **Step 4: Agregar la escritura del historial al repositorio**

Agregá a `apps/api/src/modules/deals/deals.repository.ts`:

```ts
  recordAssignment(data: Prisma.AssignmentHistoryUncheckedCreateInput) {
    return prisma.assignmentHistory.create({ data });
  },
```

- [ ] **Step 5: Escribir los métodos del servicio**

Agregá a `DealsService` en `apps/api/src/modules/deals/deals.service.ts`:

```ts
  async setStage(
    actor: Actor,
    id: string,
    input: z.infer<typeof setDealStageSchema>
  ): Promise<DealDTO> {
    const existing = await DealsRepository.findByIdAndTenant(id, actor.tenantId, ownerFilter(actor));
    if (!existing) throw new NotFoundError('Deal not found');

    await DealsRepository.updateByIdAndTenant(id, actor.tenantId, {
      stage: input.stage,
      // Reabrir un deal perdido tiene que limpiar el motivo, si no queda un texto viejo colgado
      // contradiciendo la etapa nueva.
      lostReason: input.stage === 'PERDIDO' ? input.lostReason! : null,
    });
    const updated = await DealsRepository.findByIdAndTenant(id, actor.tenantId);
    return toDTO(updated!);
  },

  async assign(actor: Actor, id: string, assignedUserId?: string): Promise<DealDTO> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Solo un administrador puede asignar un deal');

    const existing = await DealsRepository.findByIdAndTenant(id, actor.tenantId);
    if (!existing) throw new NotFoundError('Deal not found');
    await assertUserInTenant(actor.tenantId, assignedUserId);

    if (existing.assignedUserId !== (assignedUserId ?? null)) {
      await DealsRepository.updateByIdAndTenant(id, actor.tenantId, { assignedUserId: assignedUserId ?? null });
      await DealsRepository.recordAssignment({
        tenantId: actor.tenantId,
        entityType: 'DEAL',
        entityId: id,
        previousUserId: existing.assignedUserId,
        newUserId: assignedUserId ?? null,
        changedById: actor.userId,
      });
    }

    const updated = await DealsRepository.findByIdAndTenant(id, actor.tenantId);
    return toDTO(updated!);
  },
```

Agregá `setDealStageSchema` al import de tipos de `@ventry/shared` que ya está arriba del archivo.

La comparación `existing.assignedUserId !== (assignedUserId ?? null)` evita ensuciar el historial con reasignaciones que no cambian nada — asignarle a alguien el deal que ya tenía no es un evento.

- [ ] **Step 6: Escribir las rutas**

Agregá a `apps/api/src/modules/deals/deals.routes.ts`:

```ts
dealsRouter.patch('/:id/stage', async (req, res, next) => {
  try {
    const parsed = setDealStageSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await DealsService.setStage(req.user!, req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});

dealsRouter.patch('/:id/assign', async (req, res, next) => {
  try {
    const parsed = assignDealSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await DealsService.assign(req.user!, req.params.id, parsed.data.assignedUserId));
  } catch (err) {
    next(err);
  }
});
```

Agregá `setDealStageSchema, assignDealSchema` al import de `@ventry/shared` que ya está arriba.

- [ ] **Step 7: Correr los tests y verificar que pasan**

Run: `npm run test -w @ventry/api -- deals`
Expected: PASS, 12 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/deals.ts apps/api/src/modules/deals
git commit -m "feat: add deal stage transitions, lost reason and assignment history"
```

---

### Task 5: Tareas backend

**Files:**
- Create: `packages/shared/src/tasks.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/modules/tasks/tasks.repository.ts`
- Create: `apps/api/src/modules/tasks/tasks.service.ts`
- Create: `apps/api/src/modules/tasks/tasks.routes.ts`
- Test: `apps/api/src/modules/tasks/tasks.routes.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `Actor` de la Tarea 2.
- Produces: `createTaskSchema`, `updateTaskSchema`, `TaskDTO` en `@ventry/shared`; `TasksService` con `list`, `create`, `update`; `GET /tasks`, `POST /tasks`, `PATCH /tasks/:id`. La Tarea 9 depende de estos nombres.

Una `Task` no tiene `assignedUserId`, tiene `ownerId`, así que `ownerFilter` de la Tarea 2 no le sirve tal cual: el filtro se arma a mano contra `ownerId`.

- [ ] **Step 1: Escribir el test que falla**

Creá `apps/api/src/modules/tasks/tasks.routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/tasks routes', () => {
  const app = createApp();
  let tenantId: string;
  let adminToken: string;
  let sellerToken: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Tasks Route Tenant' } })).id;
    adminToken = signAccessToken({ userId: 'admin-1', tenantId, role: 'ADMIN' });
    sellerToken = signAccessToken({ userId: 'seller-1', tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.task.deleteMany({ where: { tenantId } });
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(401);
  });

  it('creates a task owned by the vendedor who created it', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Llamar a ABC SAC', dueDate: '2026-09-08' });
    expect(res.status).toBe(201);
    expect(res.body.ownerId).toBe('seller-1');
    expect(res.body.done).toBe(false);
    expect(res.body.dueDate).toBe('2026-09-08T00:00:00.000Z');
  });

  it('hides another user’s tasks from a vendedor', async () => {
    await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Tarea del admin', dueDate: '2026-09-08', ownerId: 'admin-1' });

    const res = await request(app).get('/tasks').set('Authorization', `Bearer ${sellerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('shows an admin every task in the tenant', async () => {
    await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Tarea del vendedor', dueDate: '2026-09-08' });

    const res = await request(app).get('/tasks').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body).toHaveLength(1);
  });

  it('marks a task as done', async () => {
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Llamar a ABC SAC', dueDate: '2026-09-08' });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ done: true });
    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
  });

  it('refuses to let a vendedor touch another user’s task', async () => {
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Tarea del admin', dueDate: '2026-09-08', ownerId: 'admin-1' });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ done: true });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -w @ventry/api -- tasks`
Expected: FAIL, `Cannot find module './modules/tasks/tasks.routes.js'`.

- [ ] **Step 3: Escribir los schemas**

Creá `packages/shared/src/tasks.ts`:

```ts
import { z } from 'zod';
import { optionalText } from './common.js';

export const relatedTypeSchema = z.enum(['LEAD', 'COMPANY', 'DEAL']);

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Ingresa el título de la tarea'),
  description: optionalText(z.string()),
  ownerId: optionalText(z.string()),
  relatedType: relatedTypeSchema.optional(),
  relatedId: optionalText(z.string()),
  dueDate: z.string().date('Ingresa una fecha válida'),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  done: z.boolean().optional(),
});

export interface TaskDTO {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  relatedType: 'LEAD' | 'COMPANY' | 'DEAL' | null;
  relatedId: string | null;
  dueDate: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}
```

Exportalo desde `packages/shared/src/index.ts`:

```ts
export * from './tasks.js';
```

- [ ] **Step 4: Escribir el repositorio**

Creá `apps/api/src/modules/tasks/tasks.repository.ts`:

```ts
import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '@prisma/client';

export const TasksRepository = {
  findManyByTenant(tenantId: string, owner: { ownerId?: string } = {}) {
    return prisma.task.findMany({
      where: { tenantId, ...owner },
      orderBy: [{ done: 'asc' }, { dueDate: 'asc' }],
    });
  },

  findByIdAndTenant(id: string, tenantId: string, owner: { ownerId?: string } = {}) {
    return prisma.task.findFirst({ where: { id, tenantId, ...owner } });
  },

  create(data: Prisma.TaskUncheckedCreateInput) {
    return prisma.task.create({ data });
  },

  updateByIdAndTenant(id: string, tenantId: string, data: Prisma.TaskUpdateInput) {
    return prisma.task.updateMany({ where: { id, tenantId }, data });
  },
};
```

El orden `done asc, dueDate asc` es el que quiere la vista "Mi día": lo pendiente primero, y dentro de eso lo más vencido arriba.

- [ ] **Step 5: Escribir el servicio**

Creá `apps/api/src/modules/tasks/tasks.service.ts`:

```ts
import type { TaskDTO, createTaskSchema, updateTaskSchema } from '@ventry/shared';
import type { z } from 'zod';
import type { Task } from '@prisma/client';
import { TasksRepository } from './tasks.repository.js';
import { UsersRepository } from '../users/users.repository.js';
import { NotFoundError } from '../../lib/errors.js';
import type { Actor } from '../../lib/scope.js';

export function toDTO(task: Task): TaskDTO {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    ownerId: task.ownerId,
    relatedType: task.relatedType,
    relatedId: task.relatedId,
    dueDate: task.dueDate.toISOString(),
    done: task.done,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

// Una Task se scopea por ownerId, no por assignedUserId, así que ownerFilter no aplica acá.
function taskOwnerFilter(actor: Actor): { ownerId?: string } {
  return actor.role === 'ADMIN' ? {} : { ownerId: actor.userId };
}

export const TasksService = {
  async list(actor: Actor): Promise<TaskDTO[]> {
    const tasks = await TasksRepository.findManyByTenant(actor.tenantId, taskOwnerFilter(actor));
    return tasks.map(toDTO);
  },

  async create(actor: Actor, input: z.infer<typeof createTaskSchema>): Promise<TaskDTO> {
    const ownerId = actor.role === 'ADMIN' ? (input.ownerId ?? actor.userId) : actor.userId;
    if (ownerId !== actor.userId) {
      const owner = await UsersRepository.findByIdAndTenant(ownerId, actor.tenantId);
      if (!owner) throw new NotFoundError('Task owner not found');
    }

    const task = await TasksRepository.create({
      tenantId: actor.tenantId,
      title: input.title,
      description: input.description,
      ownerId,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      dueDate: new Date(input.dueDate),
    });
    return toDTO(task);
  },

  async update(actor: Actor, id: string, input: z.infer<typeof updateTaskSchema>): Promise<TaskDTO> {
    const existing = await TasksRepository.findByIdAndTenant(id, actor.tenantId, taskOwnerFilter(actor));
    if (!existing) throw new NotFoundError('Task not found');

    await TasksRepository.updateByIdAndTenant(id, actor.tenantId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.dueDate !== undefined ? { dueDate: new Date(input.dueDate) } : {}),
      ...(input.done !== undefined ? { done: input.done } : {}),
    });
    const updated = await TasksRepository.findByIdAndTenant(id, actor.tenantId);
    return toDTO(updated!);
  },
};
```

Reasignar el dueño de una tarea existente queda fuera del alcance: `update` ignora `ownerId` a propósito. Una tarea mal asignada se cierra y se crea de nuevo.

- [ ] **Step 6: Escribir las rutas**

Creá `apps/api/src/modules/tasks/tasks.routes.ts`:

```ts
import { Router } from 'express';
import { createTaskSchema, updateTaskSchema } from '@ventry/shared';
import { TasksService } from './tasks.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

tasksRouter.get('/', async (req, res, next) => {
  try {
    res.json(await TasksService.list(req.user!));
  } catch (err) {
    next(err);
  }
});

tasksRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.status(201).json(await TasksService.create(req.user!, parsed.data));
  } catch (err) {
    next(err);
  }
});

tasksRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    res.json(await TasksService.update(req.user!, req.params.id, parsed.data));
  } catch (err) {
    next(err);
  }
});
```

Y montalo en `apps/api/src/app.ts`:

```ts
import { tasksRouter } from './modules/tasks/tasks.routes.js';
```
```ts
  app.use('/tasks', tasksRouter);
```

- [ ] **Step 7: Correr los tests y verificar que pasan**

Run: `npm run test -w @ventry/api -- tasks`
Expected: PASS, 6 tests.

- [ ] **Step 8: Correr toda la suite del backend**

Run: `npm run test -w @ventry/api`
Expected: PASS, todo verde.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src apps/api/src
git commit -m "feat: add Tasks module scoped to their owner"
```

---

### Task 6: Sesión actual en el frontend

Las Tareas 8 y 10 tienen que mostrar controles de asignación **solo a un ADMIN**, y hoy el frontend no sabe qué rol tiene el usuario logueado: `apps/web/src/lib/api.ts` guarda el access token en una variable de módulo y no lo expone. Esta tarea agrega esa pieza.

Decodificar el JWT en el cliente sería más corto, pero se rompe justo en el caso normal: después de un reload el token en memoria es `null` hasta que el primer 401 dispara el refresh, así que el admin perdería sus controles hasta el siguiente fetch. Un `GET /auth/me` pasa por `apiClient`, hereda el interceptor de refresh que ya existe, y al ser una query de TanStack re-renderiza sola cuando resuelve.

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts`
- Modify: `apps/api/src/modules/auth/auth.routes.ts`
- Test: `apps/api/src/modules/auth/auth.routes.test.ts` (agregar caso)
- Modify: `apps/web/src/hooks/useAuth.ts`

**Interfaces:**
- Consumes: `requireAuth`, `UsersRepository.findByIdAndTenant`.
- Produces: `GET /auth/me` → `UserDTO`; `useSession()` en `apps/web/src/hooks/useAuth.ts`, que devuelve el `UseQueryResult<UserDTO>`. Las Tareas 8 y 10 leen `session.data?.role === 'ADMIN'`.

- [ ] **Step 1: Escribir el test que falla**

Agregá a `apps/api/src/modules/auth/auth.routes.test.ts`, dentro del `describe` existente:

```ts
  it('returns the logged-in user from /auth/me', async () => {
    const login = await request(app)
      .post('/auth/login')
      .send({ email: seededEmail, password: seededPassword });
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(seededEmail);
    expect(res.body.role).toBe('ADMIN');
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('rejects /auth/me without a token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });
```

Usá los nombres de variable que ese archivo ya tenga para el email y la contraseña del usuario de prueba; `seededEmail`/`seededPassword` son un marcador de posición para lo que ya esté ahí.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -w @ventry/api -- auth`
Expected: FAIL con 404 en `GET /auth/me`.

- [ ] **Step 3: Exportar el mapper de usuario y agregar el método de servicio**

En `apps/api/src/modules/users/users.service.ts`, cambiá `function toDTO(user: User)` por `export function toDTO(user: User)` y agregá a `UsersService`:

```ts
  async me(actor: { userId: string; tenantId: string }): Promise<UserDTO> {
    const user = await UsersRepository.findByIdAndTenant(actor.userId, actor.tenantId);
    if (!user) throw new NotFoundError('User not found');
    return toDTO(user);
  },
```

`NotFoundError` ya está importado en ese archivo.

- [ ] **Step 4: Agregar la ruta**

En `apps/api/src/modules/auth/auth.routes.ts`:

```ts
import { UsersService } from '../users/users.service.js';
import { requireAuth } from '../../middleware/auth.js';
```
```ts
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    res.json(await UsersService.me(req.user!));
  } catch (err) {
    next(err);
  }
});
```

`requireAuth` va en la ruta y no en el router entero: `/auth/login` y `/auth/refresh` tienen que seguir siendo públicas.

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npm run test -w @ventry/api -- auth`
Expected: PASS.

- [ ] **Step 6: Agregar el hook**

Agregá a `apps/web/src/hooks/useAuth.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import type { UserDTO } from '@ventry/shared';
```
```ts
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async () => (await apiClient.get<UserDTO>('/auth/me')).data,
    staleTime: Infinity,
    retry: false,
  });
}
```

`staleTime: Infinity` porque el rol de un usuario no cambia dentro de una sesión, y `retry: false` para no reintentar cuando no hay sesión y el refresh también falla.

- [ ] **Step 7: Verificar que compila y que los tests pasan**

Run: `npm run build && npm test`
Expected: build exit 0, toda la suite en verde.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src apps/web/src
git commit -m "feat: expose the logged-in user through GET /auth/me"
```

---

### Task 7: Pipeline frontend — tablero kanban con drag & drop

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/hooks/useDeals.ts`
- Test: `apps/web/src/hooks/useDeals.test.tsx`
- Create: `apps/web/src/lib/money.ts`
- Create: `apps/web/src/pages/DealsPage.tsx`
- Modify: `apps/web/src/routes/router.tsx`

**Interfaces:**
- Consumes: `GET /deals`, `PATCH /deals/:id/stage` de las Tareas 3 y 4. `DealDTO`, `dealStageSchema` de `@ventry/shared`.
- Produces: `useDeals`, `useCreateDeal`, `useSetDealStage`, `useAssignDeal`, `useUpdateDeal`; `formatMoney`; la ruta `/deals`. La Tarea 8 usa los cuatro hooks de mutación.

- [ ] **Step 1: Instalar la dependencia del tablero**

```bash
npm install @dnd-kit/core@^6.1.0 -w @ventry/web
```

Solo `@dnd-kit/core`. **No** instales `@dnd-kit/sortable`: las cards no se reordenan dentro de una columna, solo se mueven entre columnas, y para eso alcanzan `useDraggable` + `useDroppable`.

- [ ] **Step 2: Escribir el test que falla, para el hook de datos**

Creá `apps/web/src/hooks/useDeals.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../lib/api.js';
import { useDeals } from './useDeals.js';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useDeals', () => {
  it('fetches the deal list', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [{ id: '1', title: 'Web corporativa', stage: 'CONTACTO' }],
    });
    const { result } = renderHook(() => useDeals(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `npm run test -w @ventry/web -- useDeals`
Expected: FAIL, no se puede resolver `./useDeals.js`.

- [ ] **Step 4: Escribir los hooks**

Creá `apps/web/src/hooks/useDeals.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DealDTO } from '@ventry/shared';
import { apiClient } from '../lib/api.js';

const DEALS_KEY = ['deals'];

export function useDeals() {
  return useQuery({
    queryKey: DEALS_KEY,
    queryFn: async () => (await apiClient.get<DealDTO[]>('/deals')).data,
  });
}

export interface CreateDealInput {
  companyId: string;
  title: string;
  amount: string;
  currency: 'PEN' | 'USD';
  assignedUserId?: string;
  expectedCloseDate?: string;
  nextStepDescription?: string;
  nextStepOwnerId?: string;
  nextStepDate?: string;
}

export function useCreateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDealInput) => (await apiClient.post<DealDTO>('/deals', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEALS_KEY }),
  });
}

export function useUpdateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CreateDealInput> & { id: string }) =>
      (await apiClient.patch<DealDTO>(`/deals/${id}`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEALS_KEY }),
  });
}

export function useSetDealStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage, lostReason }: { id: string; stage: DealDTO['stage']; lostReason?: string }) =>
      (await apiClient.patch<DealDTO>(`/deals/${id}/stage`, { stage, lostReason })).data,
    // Update optimista: sin esto la card vuelve a saltar a su columna vieja entre que se suelta y
    // que responde el refetch, y el arrastre se siente roto aunque haya funcionado.
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: DEALS_KEY });
      const previous = queryClient.getQueryData<DealDTO[]>(DEALS_KEY);
      queryClient.setQueryData<DealDTO[]>(DEALS_KEY, (deals) =>
        deals?.map((deal) => (deal.id === id ? { ...deal, stage } : deal))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(DEALS_KEY, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: DEALS_KEY }),
  });
}

export function useAssignDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, assignedUserId }: { id: string; assignedUserId?: string }) =>
      (await apiClient.patch<DealDTO>(`/deals/${id}/assign`, { assignedUserId })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEALS_KEY }),
  });
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npm run test -w @ventry/web -- useDeals`
Expected: PASS, 1 test.

- [ ] **Step 6: Escribir el formateador de dinero**

Creá `apps/web/src/lib/money.ts`:

```ts
// El monto llega como string desde el Decimal de Postgres. Se pasa a número solo acá, para mostrar:
// nunca para sumar montos, y menos entre monedas distintas (PEN y USD van siempre separados).
export function formatMoney(amount: string, currency: 'PEN' | 'USD'): string {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(Number(amount));
}
```

- [ ] **Step 7: Escribir la página del pipeline**

Creá `apps/web/src/pages/DealsPage.tsx`:

```tsx
import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { DealDTO } from '@ventry/shared';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { useDeals, useSetDealStage } from '../hooks/useDeals.js';
import { formatMoney } from '../lib/money.js';
import { CreateDealDialog } from '../components/deals/CreateDealDialog.js';
import { LostReasonDialog } from '../components/deals/LostReasonDialog.js';

// El orden del pipeline es el del spec de negocio, sección 22. PERDIDO va al final y fuera de la
// secuencia: es una salida, no un paso.
const STAGES: DealDTO['stage'][] = [
  'CONTACTO',
  'PROPUESTA',
  'NEGOCIACION',
  'ADELANTO',
  'PRODUCCION',
  'ENTREGADO',
  'MANTENIMIENTO',
  'PERDIDO',
];

const STAGE_LABEL: Record<DealDTO['stage'], string> = {
  CONTACTO: 'Contacto',
  PROPUESTA: 'Propuesta/Maqueta',
  NEGOCIACION: 'Negociación',
  ADELANTO: 'Adelanto',
  PRODUCCION: 'Producción',
  ENTREGADO: 'Entregado',
  MANTENIMIENTO: 'Mantenimiento',
  PERDIDO: 'Perdido',
};

function isOverdue(date: string | null): boolean {
  return !!date && new Date(date) < new Date(new Date().toDateString());
}

function DealCard({ deal }: { deal: DealDTO }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-lg border border-gray-200 bg-white p-3 shadow-sm ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <p className="text-sm font-medium text-gray-900">{deal.title}</p>
      <p className="text-xs text-gray-500">{deal.companyName}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{formatMoney(deal.amount, deal.currency)}</p>
      {deal.nextStepDescription && (
        <p className={`mt-2 text-xs ${isOverdue(deal.nextStepDate) ? 'font-medium text-red-600' : 'text-gray-500'}`}>
          {deal.nextStepDescription}
          {deal.nextStepDate && ` · ${new Date(deal.nextStepDate).toLocaleDateString('es-PE')}`}
        </p>
      )}
      {deal.stage === 'PERDIDO' && deal.lostReason && (
        <p className="mt-2 text-xs text-gray-500">Motivo: {deal.lostReason}</p>
      )}
    </div>
  );
}

function StageColumn({ stage, deals }: { stage: DealDTO['stage']; deals: DealDTO[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div className="w-64 shrink-0">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{STAGE_LABEL[stage]}</span>
        <Badge tone="neutral">{deals.length}</Badge>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-40 flex-col gap-2 rounded-xl p-2 transition-colors ${
          isOver ? 'bg-gray-200' : 'bg-gray-100'
        }`}
      >
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>
    </div>
  );
}

export function DealsPage() {
  const { data: deals, isLoading } = useDeals();
  const setStage = useSetDealStage();
  const [lostDeal, setLostDeal] = useState<DealDTO | null>(null);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  const onDragEnd = (event: DragEndEvent) => {
    const stage = event.over?.id as DealDTO['stage'] | undefined;
    const deal = deals?.find((d) => d.id === event.active.id);
    if (!stage || !deal || deal.stage === stage) return;
    // PERDIDO exige un motivo (spec de negocio, sección 22), así que el drop abre el diálogo en vez
    // de mandar la mutación: sin motivo el backend responde 400 igual.
    if (stage === 'PERDIDO') {
      setLostDeal(deal);
      return;
    }
    setStage.mutate({ id: deal.id, stage });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pipeline</h1>
        <CreateDealDialog />
      </div>
      {setStage.isError && <p className="mb-4 text-sm text-red-600">No se pudo mover el deal de etapa.</p>}
      {isLoading ? (
        <Card className="p-6 text-sm text-gray-500">Cargando…</Card>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STAGES.map((stage) => (
              <StageColumn key={stage} stage={stage} deals={(deals ?? []).filter((d) => d.stage === stage)} />
            ))}
          </div>
        </DndContext>
      )}
      <LostReasonDialog deal={lostDeal} onClose={() => setLostDeal(null)} />
    </div>
  );
}
```

`KeyboardSensor` no es decorativo: sin él el tablero solo funciona con mouse y queda inaccesible para teclado. dnd-kit lo trae de fábrica, no lo saques.

- [ ] **Step 8: Registrar la ruta**

En `apps/web/src/routes/router.tsx`, agregá dentro de los `children` del `AppShell`, junto a las rutas que ya están:

```tsx
      { path: 'deals', element: <DealsPage /> },
```

con su import arriba. La entrada "Deals" del sidebar en `AppShell.tsx` ya apunta a `/deals` desde Plan 1.

- [ ] **Step 9: Verificar que compila**

Run: `npm run build -w @ventry/web`
Expected: falla con "Cannot find module '../components/deals/CreateDealDialog.js'" — esos dos componentes los crea la Tarea 8. Es esperado; el commit de esta tarea deja el build del web roto y la Tarea 8 lo cierra. Si preferís no dejar el build roto entre tareas, hacé las Tareas 7 y 8 en un solo commit.

- [ ] **Step 10: Commit**

```bash
git add apps/web/package.json package-lock.json apps/web/src
git commit -m "feat: add pipeline board with drag and drop"
```

---

### Task 8: Diálogos de deal — crear, motivo de pérdida y asignación

**Files:**
- Create: `apps/web/src/components/deals/CreateDealDialog.tsx`
- Create: `apps/web/src/components/deals/LostReasonDialog.tsx`
- Modify: `apps/web/src/pages/DealsPage.tsx`

**Interfaces:**
- Consumes: `useCreateDeal`, `useSetDealStage`, `useAssignDeal` de la Tarea 7; `useSession` de la Tarea 6; `useCompanies` de Plan 2; `useUsers` de Plan 1; `createDealSchema` de `@ventry/shared`.
- Produces: `CreateDealDialog`, `LostReasonDialog` — los dos que la Tarea 7 ya importa.

- [ ] **Step 1: Escribir el diálogo de creación**

Creá `apps/web/src/components/deals/CreateDealDialog.tsx`:

```tsx
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createDealSchema } from '@ventry/shared';
import { z } from 'zod';
import { Button } from '../ui/button.js';
import { useCreateDeal } from '../../hooks/useDeals.js';
import { useCompanies } from '../../hooks/useCompanies.js';
import { useUsers } from '../../hooks/useUsers.js';

type FormValues = z.infer<typeof createDealSchema>;

export function CreateDealDialog() {
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(createDealSchema),
    defaultValues: { currency: 'PEN' },
  });
  const createDeal = useCreateDeal();
  const { data: companies } = useCompanies();
  const { data: users } = useUsers();

  const submit = (data: FormValues) =>
    createDeal.mutate(data, {
      onSuccess: () => {
        reset();
        setOpen(false);
      },
    });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button>Agregar deal</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-4 text-lg font-semibold">Nuevo deal</Dialog.Title>
          <form className="space-y-3" onSubmit={handleSubmit(submit)}>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" {...register('companyId')}>
              <option value="">Selecciona una empresa</option>
              {companies?.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="Título (ej. Web corporativa)"
              {...register('title')}
            />
            <div className="flex gap-2">
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="Monto (ej. 8000)"
                inputMode="decimal"
                {...register('amount')}
              />
              <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" {...register('currency')}>
                <option value="PEN">PEN</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              {...register('assignedUserId')}
            >
              <option value="">Sin vendedor asignado</option>
              {users?.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.firstName} {user.lastName}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              type="date"
              {...register('expectedCloseDate')}
            />
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="Próximo paso (opcional)"
              {...register('nextStepDescription')}
            />
            <div className="flex gap-2">
              {/* El próximo paso lleva descripción, responsable y fecha (spec de negocio, sección 16). */}
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                {...register('nextStepOwnerId')}
              >
                <option value="">Responsable del próximo paso</option>
                {users?.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.firstName} {user.lastName}
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                type="date"
                {...register('nextStepDate')}
              />
            </div>
            {Object.values(errors).map((err, i) => (
              <p key={i} className="text-xs text-red-600">{err?.message as string}</p>
            ))}
            {createDeal.isError && <p className="text-xs text-red-600">No se pudo crear el deal.</p>}
            <Button type="submit" className="w-full" disabled={createDeal.isPending}>
              {createDeal.isPending ? 'Creando…' : 'Crear deal'}
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Los `<input type="date">` son nativos a propósito — el navegador ya da el calendario, la validación de formato y el manejo de locale, y mandan exactamente el `YYYY-MM-DD` que espera `z.string().date()`. No agregues una librería de date picker.

- [ ] **Step 2: Escribir el diálogo de motivo de pérdida**

Creá `apps/web/src/components/deals/LostReasonDialog.tsx`:

```tsx
import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { DealDTO } from '@ventry/shared';
import { Button } from '../ui/button.js';
import { useSetDealStage } from '../../hooks/useDeals.js';

export function LostReasonDialog({ deal, onClose }: { deal: DealDTO | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const setStage = useSetDealStage();

  useEffect(() => setReason(''), [deal?.id]);

  const submit = () => {
    if (!deal || !reason.trim()) return;
    setStage.mutate({ id: deal.id, stage: 'PERDIDO', lostReason: reason.trim() }, { onSuccess: onClose });
  };

  return (
    <Dialog.Root open={!!deal} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-2 text-lg font-semibold">Marcar deal como perdido</Dialog.Title>
          <p className="mb-4 text-sm text-gray-500">
            {deal?.title} — {deal?.companyName}. El deal no se elimina, queda registrado como perdido.
          </p>
          <textarea
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            rows={3}
            placeholder="Motivo de pérdida"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {setStage.isError && <p className="mt-2 text-xs text-red-600">No se pudo marcar el deal como perdido.</p>}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button className="flex-1" disabled={!reason.trim() || setStage.isPending} onClick={submit}>
              Marcar perdido
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 3: Agregar el selector de vendedor a la card, solo para ADMIN**

En `apps/web/src/pages/DealsPage.tsx`, importá el hook de usuarios, el de asignación y el contexto de sesión:

```tsx
import { useAssignDeal, useDeals, useSetDealStage } from '../hooks/useDeals.js';
import { useUsers } from '../hooks/useUsers.js';
import { useSession } from '../hooks/useAuth.js';
```

Dentro de `DealsPage`, calculá el permiso y pasalo hacia abajo:

```tsx
  const session = useSession();
  const canAssign = session.data?.role === 'ADMIN';
```

`DealCard` pasa a recibir `deal` y `canAssign` (`{ deal, canAssign }: { deal: DealDTO; canAssign: boolean }`), llama a `useUsers()` y `useAssignDeal()` adentro, y `StageColumn` reenvía `canAssign` a cada card. Renderizá el selector al pie de la card:

```tsx
      {canAssign && (
        <select
          className="mt-2 w-full rounded-md border border-gray-200 px-2 py-1 text-xs"
          value={deal.assignedUserId ?? ''}
          // El select vive dentro de un elemento arrastrable: sin esto, dnd-kit se come el pointerdown
          // y el desplegable no llega a abrirse.
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => assign.mutate({ id: deal.id, assignedUserId: e.target.value || undefined })}
        >
          <option value="">Sin asignar</option>
          {users?.map((user) => (
            <option key={user.id} value={user.id}>
              {user.firstName} {user.lastName}
            </option>
          ))}
        </select>
      )}
```

- [ ] **Step 4: Verificar que compila y que los tests pasan**

Run: `npm run build && npm test`
Expected: build exit 0 y toda la suite en verde. Este es el commit que cierra el build del web que la Tarea 7 dejó abierto.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat: add deal dialogs for creation, lost reason and assignment"
```

---

### Task 9: Tareas frontend — Mi día con vencidas destacadas

**Files:**
- Create: `apps/web/src/hooks/useTasks.ts`
- Test: `apps/web/src/hooks/useTasks.test.tsx`
- Create: `apps/web/src/components/tasks/CreateTaskDialog.tsx`
- Create: `apps/web/src/pages/TasksPage.tsx`
- Modify: `apps/web/src/routes/router.tsx`

**Interfaces:**
- Consumes: `GET /tasks`, `POST /tasks`, `PATCH /tasks/:id` de la Tarea 5.
- Produces: `useTasks`, `useCreateTask`, `useUpdateTask`; la ruta `/tasks`.

- [ ] **Step 1: Escribir el test que falla**

Creá `apps/web/src/hooks/useTasks.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../lib/api.js';
import { useTasks } from './useTasks.js';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useTasks', () => {
  it('fetches the task list', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [{ id: '1', title: 'Llamar a ABC SAC', done: false }],
    });
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -w @ventry/web -- useTasks`
Expected: FAIL, no se puede resolver `./useTasks.js`.

- [ ] **Step 3: Escribir los hooks**

Creá `apps/web/src/hooks/useTasks.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskDTO } from '@ventry/shared';
import { apiClient } from '../lib/api.js';

const TASKS_KEY = ['tasks'];

export function useTasks() {
  return useQuery({
    queryKey: TASKS_KEY,
    queryFn: async () => (await apiClient.get<TaskDTO[]>('/tasks')).data,
  });
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  ownerId?: string;
  dueDate: string;
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaskInput) => (await apiClient.post<TaskDTO>('/tasks', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; done?: boolean; title?: string; dueDate?: string }) =>
      (await apiClient.patch<TaskDTO>(`/tasks/${id}`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test -w @ventry/web -- useTasks`
Expected: PASS, 1 test.

- [ ] **Step 5: Escribir el diálogo de creación**

Creá `apps/web/src/components/tasks/CreateTaskDialog.tsx`:

```tsx
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createTaskSchema } from '@ventry/shared';
import { z } from 'zod';
import { Button } from '../ui/button.js';
import { useCreateTask } from '../../hooks/useTasks.js';

type FormValues = z.infer<typeof createTaskSchema>;

export function CreateTaskDialog() {
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(createTaskSchema),
  });
  const createTask = useCreateTask();

  const submit = (data: FormValues) =>
    createTask.mutate(data, {
      onSuccess: () => {
        reset();
        setOpen(false);
      },
    });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button>Agregar tarea</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-4 text-lg font-semibold">Nueva tarea</Dialog.Title>
          <form className="space-y-3" onSubmit={handleSubmit(submit)}>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="¿Qué hay que hacer?"
              {...register('title')}
            />
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" type="date" {...register('dueDate')} />
            <textarea
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              rows={2}
              placeholder="Detalle (opcional)"
              {...register('description')}
            />
            {Object.values(errors).map((err, i) => (
              <p key={i} className="text-xs text-red-600">{err?.message as string}</p>
            ))}
            {createTask.isError && <p className="text-xs text-red-600">No se pudo crear la tarea.</p>}
            <Button type="submit" className="w-full" disabled={createTask.isPending}>
              {createTask.isPending ? 'Creando…' : 'Crear tarea'}
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 6: Escribir la página**

Creá `apps/web/src/pages/TasksPage.tsx`:

```tsx
import type { TaskDTO } from '@ventry/shared';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { useTasks, useUpdateTask } from '../hooks/useTasks.js';
import { CreateTaskDialog } from '../components/tasks/CreateTaskDialog.js';

const startOfToday = () => new Date(new Date().toDateString());

function isOverdue(task: TaskDTO): boolean {
  return !task.done && new Date(task.dueDate) < startOfToday();
}

function isToday(task: TaskDTO): boolean {
  return new Date(task.dueDate).toDateString() === new Date().toDateString();
}

function TaskRow({ task }: { task: TaskDTO }) {
  const update = useUpdateTask();
  return (
    <li className="flex items-start gap-3 border-b border-gray-100 px-4 py-3 last:border-0">
      <input
        type="checkbox"
        className="mt-1"
        checked={task.done}
        disabled={update.isPending}
        onChange={(e) => update.mutate({ id: task.id, done: e.target.checked })}
        aria-label={`Marcar "${task.title}" como completada`}
      />
      <div className="flex-1">
        <p className={`text-sm ${task.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{task.title}</p>
        {task.description && <p className="text-xs text-gray-500">{task.description}</p>}
      </div>
      <Badge tone={isOverdue(task) ? 'danger' : 'neutral'}>
        {new Date(task.dueDate).toLocaleDateString('es-PE')}
      </Badge>
    </li>
  );
}

function TaskSection({ title, tasks }: { title: string; tasks: TaskDTO[] }) {
  if (tasks.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-medium text-gray-600">
        {title} ({tasks.length})
      </h2>
      <Card className="overflow-hidden">
        <ul>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

export function TasksPage() {
  const { data: tasks, isLoading } = useTasks();
  const all = tasks ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mi día</h1>
        <CreateTaskDialog />
      </div>
      {isLoading ? (
        <Card className="p-6 text-sm text-gray-500">Cargando…</Card>
      ) : all.length === 0 ? (
        <Card className="p-6 text-sm text-gray-500">No tienes tareas pendientes.</Card>
      ) : (
        <>
          <TaskSection title="Vencidas" tasks={all.filter(isOverdue)} />
          <TaskSection title="Hoy" tasks={all.filter((t) => !t.done && isToday(t))} />
          <TaskSection
            title="Próximas"
            tasks={all.filter((t) => !t.done && !isOverdue(t) && !isToday(t))}
          />
          <TaskSection title="Completadas" tasks={all.filter((t) => t.done)} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Registrar la ruta**

En `apps/web/src/routes/router.tsx`, dentro de los `children` del `AppShell`:

```tsx
      { path: 'tasks', element: <TasksPage /> },
```

La entrada "Tareas" del sidebar ya apunta a `/tasks` desde Plan 1.

- [ ] **Step 8: Verificar que compila y que los tests pasan**

Run: `npm run build && npm test`
Expected: build exit 0, toda la suite en verde.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat: add Tareas page with Mi día sections and overdue highlighting"
```

---

### Task 10: Asignación de vendedor en Leads y Empresas

La Tarea 2 hace que un registro sin `assignedUserId` sea invisible para todo vendedor. Todos los leads y empresas creados durante Plan 2 están así, y hoy no hay ninguna UI para asignarlos. Esta tarea cierra ese círculo.

**Files:**
- Modify: `apps/web/src/hooks/useLeads.ts`
- Modify: `apps/web/src/hooks/useCompanies.ts`
- Modify: `apps/web/src/pages/LeadsPage.tsx`
- Modify: `apps/web/src/pages/CompaniesPage.tsx`

**Interfaces:**
- Consumes: `PATCH /leads/:id` y `PATCH /companies/:id` (los dos ya aceptan `assignedUserId` desde Plan 2, y la Tarea 2 los limitó a ADMIN); `useUsers` de Plan 1; `useSession` de la Tarea 6.
- Produces: `useUpdateLead`, `useUpdateCompany`.

- [ ] **Step 1: Agregar el hook de update de lead**

Agregá a `apps/web/src/hooks/useLeads.ts`:

```ts
export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; assignedUserId?: string }) =>
      (await apiClient.patch<LeadDTO>(`/leads/${id}`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LEADS_KEY }),
  });
}
```

Y el equivalente en `apps/web/src/hooks/useCompanies.ts`, con `CompanyDTO`, `/companies/${id}` y `COMPANIES_KEY`.

- [ ] **Step 2: Agregar la columna "Vendedor" a la tabla de leads**

En `apps/web/src/pages/LeadsPage.tsx`, importá `useUsers`, `useUpdateLead` y `useSession`, y agregá arriba, junto a los otros hooks del componente:

```tsx
  const { data: users } = useUsers();
  const updateLead = useUpdateLead();
  const isAdmin = useSession().data?.role === 'ADMIN';
```

Después agregá esta columna antes de la de acciones:

```tsx
    columnHelper.accessor('assignedUserId', {
      header: 'Vendedor',
      cell: ({ row }) => {
        const lead = row.original;
        if (!isAdmin) {
          const owner = users?.find((u) => u.id === lead.assignedUserId);
          return <span className="text-sm text-gray-600">{owner ? `${owner.firstName} ${owner.lastName}` : '—'}</span>;
        }
        return (
          <select
            className="rounded-lg border border-gray-200 px-2 py-1 text-sm"
            value={lead.assignedUserId ?? ''}
            disabled={updateLead.isPending && updateLead.variables?.id === lead.id}
            onChange={(e) => updateLead.mutate({ id: lead.id, assignedUserId: e.target.value || undefined })}
          >
            <option value="">Sin asignar</option>
            {users?.map((user) => (
              <option key={user.id} value={user.id}>
                {user.firstName} {user.lastName}
              </option>
            ))}
          </select>
        );
      },
    }),
```

- [ ] **Step 3: Repetir en la tabla de empresas**

Mismo bloque en `apps/web/src/pages/CompaniesPage.tsx`, con `updateCompany` en lugar de `updateLead`.

- [ ] **Step 4: Verificar que compila y que los tests pasan**

Run: `npm run build && npm test`
Expected: build exit 0, toda la suite en verde.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat: let an admin assign leads and companies to a vendedor"
```

---

## Verificación manual final (después de las 9 tareas)

Igual que en Plan 1 y Plan 2, con los dos servidores levantados (`npm run dev:api` y `npm run dev:web`) contra el Postgres de pruebas:

1. Entrar como `admin@roult.pe`, crear un deal desde el diálogo y ver que aparece en la columna **Contacto**.
2. Arrastrar la card a **Negociación** y confirmar que se queda ahí sin parpadear de vuelta (update optimista) y que sobrevive a un reload.
3. Arrastrar la card a **Perdido**: tiene que abrirse el diálogo de motivo, y el botón "Marcar perdido" tiene que estar deshabilitado hasta escribir algo. Confirmar que el deal queda en Perdido, con el motivo visible, y que **no** desaparece de la lista.
4. Mover ese mismo deal de vuelta a **Negociación** y verificar que el motivo de pérdida se limpió.
5. Repetir el paso 2 usando **solo el teclado** (tab hasta la card, espacio para levantarla, flechas para moverla, espacio para soltarla) — es lo que cubre el `KeyboardSensor`.
6. Asignar el deal a un vendedor desde el selector de la card, y confirmar en la base que quedó una fila en `AssignmentHistory`.
7. Crear una tarea con fecha de ayer y verificar que aparece bajo **Vencidas** con el badge en rojo; marcarla como completada y ver que se mueve a **Completadas**.
8. Crear un segundo usuario `VENDEDOR`, entrar con él, y confirmar que **no** ve los deals, leads, empresas ni tareas del admin — y que lo que él crea sí le queda asignado y visible.
9. Revisar la consola del navegador: sin errores más allá del warning conocido de React Router v7.

---

## Fuera del alcance de este plan

- **Actividades** (`Activity`, timeline de llamadas/reuniones/notas/cambios de etapa) — el módulo entero pasa a Plan 4, junto con búsqueda global, filtros, import/export, dashboard operativo y auditoría.
- **Reasignación de contactos**: un `Contact` no tiene dueño propio, sigue al de su empresa. Si hace falta separarlos, es una decisión de negocio para más adelante.
- **Historial de asignación de leads y empresas**: la Tarea 10 permite asignarlos, pero solo los deals escriben en `AssignmentHistory`. Extenderlo es un cambio de dos líneas por entidad cuando el dashboard lo necesite.
- **Dashboard de deals** (activos/ganados/perdidos, MRR, PEN y USD separados) — Plan 4.
