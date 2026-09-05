# VentryCRM — Diseño MVP F1

Fecha: 2026-09-05
Basado en: `modulos-crm-roult.pdf` + `roult-crm-mvp-y-roadmap-v2-vendedores.md` + 6 imágenes de referencia visual.

Este documento cierra las decisiones de arquitectura no explícitas en el spec de negocio. Las reglas de negocio (pipeline, comisiones, monedas, deduplicación, etc.) están definidas en los documentos originales y no se repiten aquí salvo cuando afectan una decisión técnica.

Decisiones confirmadas por el usuario antes de que se desconectara (modo autónomo activado para el resto):

- Multi-tenancy: **schema compartido + `tenantId`** en cada fila.
- Auth: **JWT propio en Express** (no Supabase Auth).
- Repo/ORM: **monorepo + Prisma**.
- Alcance SaaS: **multi-tenant real desde el día 1**, con ROUlt como primer tenant.

---

## A. Arquitectura y estructura de repo

```
ventry-crm/
├── apps/
│   ├── web/          # React + TS + Vite + Tailwind + shadcn/ui
│   └── api/          # Node + Express + TS
├── packages/
│   └── shared/       # Zod schemas + tipos TS + enums compartidos entre web y api
├── prisma/
│   └── schema.prisma
├── Dockerfile          # apps/api, para despliegue portable
└── docker-compose.yml  # Postgres local SOLO para tests de integración
```

El frontend nunca llama a Supabase directamente: todo pasa por `apps/api`, que es el único lugar donde se aplican permisos por rol y el filtro por tenant. `packages/shared` evita que frontend y backend diverjan en la forma de los datos (un solo enum de estados, una sola validación Zod reusada en formularios y en el backend).

## B. Modelo de datos y multi-tenancy

Entidades Prisma (`Tenant` es la empresa cliente del SaaS, distinta de `Company` que es la empresa/negocio dentro del CRM de un tenant — evita el choque de nombres entre "mi empresa" y "el cliente de mi empresa"):

- **Tenant**: id, name, createdAt.
- **User**: id, tenantId, email (único global), passwordHash, firstName, lastName, role (`ADMIN`|`VENDEDOR`), status (`ACTIVE`|`INACTIVE`), phone, avatarUrl?, commissionPct (default 20), hireDate, createdAt, updatedAt.
- **RefreshToken**: id, userId, tokenHash, userAgent, expiresAt, revokedAt, createdAt.
- **AuditLog**: id, tenantId, userId, action, entityType, entityId, before(Json?), after(Json?), createdAt. Cubre "quién creó/modificó" y reasignaciones.
- **Company** (empresa/negocio cliente — "Empresa" del spec): id, tenantId, name, line (`WEB`|`SOFTWARE`), city, source, whatsapp, email, assignedUserId, notes, createdAt, updatedAt.
- **Contact**: id, tenantId, companyId, name, position, phone, whatsapp, email, notes, createdAt, updatedAt.
- **Lead**: id, tenantId, businessName, contactName, phone, whatsapp, email, line, source, assignedUserId, status (`NEW`|`CONTACTED`|`QUALIFIED`|`CONVERTED`|`UNQUALIFIED`|`LOST`), notes, convertedCompanyId?, convertedAt?, createdAt, updatedAt.
- **Deal**: id, tenantId, companyId, title, amount (Decimal), currency (`PEN`|`USD`), stage (`CONTACTO`|`PROPUESTA`|`NEGOCIACION`|`ADELANTO`|`PRODUCCION`|`ENTREGADO`|`MANTENIMIENTO`|`PERDIDO`), assignedUserId, expectedCloseDate?, lostReason?, nextStepDescription?, nextStepOwnerId?, nextStepDate?, createdAt, updatedAt.
- **Activity**: id, tenantId, type (`CALL`|`MEETING`|`NOTE`|`FOLLOWUP`|`TASK`|`STAGE_CHANGE`), relatedType (`LEAD`|`COMPANY`|`DEAL`), relatedId, userId, description, occurredAt, createdAt.
- **Task**: id, tenantId, title, description?, ownerId, relatedType?, relatedId?, dueDate, done, createdAt, updatedAt.
- **AssignmentHistory**: id, tenantId, entityType, entityId, previousUserId?, newUserId, changedById, changedAt.

Dinero siempre como `{ amount: Decimal, currency: PEN|USD }` — nunca un campo numérico suelto. Nunca se suman montos de distinta moneda; los agregados (dashboard) devuelven un objeto `{ PEN: number, USD: number }`.

**Aislamiento entre tenants (decisión clave):** en el MVP el aislamiento se aplica en la capa de aplicación, no en RLS de Postgres. Cada repositorio recibe el `tenantId` desde el JWT del usuario autenticado (nunca desde el body/query del cliente) y lo inyecta automáticamente en cada query — un repositorio base tipo `tenantScoped(tenantId)` hace estructuralmente difícil olvidarlo. Se agrega un test de integración que verifica que ningún endpoint puede leer/escribir datos de otro tenant.

`ponytail:` RLS de Postgres queda pendiente como capa de defensa adicional — se agrega cuando haya requisito de compliance o más de un ingeniero tocando queries crudas; con un solo backend y repositorio scoped, es complejidad que no paga su costo todavía.

## C. Autenticación y sesiones

- `POST /auth/login` — email + password → access token JWT (15 min, incluye `userId`, `tenantId`, `role`) + refresh token opaco (30 días, hasheado en tabla `RefreshToken`, cookie httpOnly + Secure + SameSite=Lax).
- `POST /auth/refresh` — rota el refresh token (invalida el anterior, emite uno nuevo) para mitigar replay.
- `POST /auth/logout` — revoca el refresh token actual.
- Passwords con `bcrypt`.
- Middleware `requireAuth` valida el access token y llena `req.user = { id, tenantId, role }`; middleware `requireRole('ADMIN')` para rutas de administración.
- **No hay señal de registro público de tenants en el MVP.** Se decidió "multi-tenant real" a nivel de esquema, pero el alta de un nuevo Tenant + su primer usuario ADMIN se hace con un script de seed/CLI interno, no con un formulario de signup — evita construir todo un flujo de onboarding/billing que no hace falta todavía. El primer tenant sembrado es ROUlt.

## D. Patrones de backend

Arquitectura en capas por módulo (`leads`, `deals`, `users`, `companies`, etc.):

```
routes → controller (parsea request, llama al service, formatea respuesta)
       → service   (reglas de negocio, autorización, orquesta repositorios)
       → repository (queries Prisma, siempre scoped por tenantId)
```

Validación de entrada con Zod (mismo schema reusado en `packages/shared` para validar formularios en el frontend). Errores tipados (`NotFoundError`, `ForbiddenError`, `ValidationError`) capturados por un middleware central que los mapea a códigos HTTP — nunca se filtran stack traces en producción.

Es un monolito Express en capas — sin microservicios, sin CQRS/event sourcing. Correcto para la escala actual; el particionado por módulo (no por capa técnica transversal) es lo que permite separar servicios más adelante si hace falta.

## E. Frontend y sistema de diseño

Derivado de las 6 imágenes de referencia (todas comparten el mismo lenguaje: sidebar con iconos, fondo gris muy claro, cards blancas con sombra suave y esquinas redondeadas, botones primarios negros, chips de estado con color pastel, tablas de datos ordenables, avatares circulares, stat tiles con número grande y label en mayúsculas pequeñas).

- **Stack:** React + TypeScript + Vite, Tailwind CSS + shadcn/ui (Radix) — el look de las referencias (bordes sutiles, `rounded-xl`, dropdowns/dialogs accesibles) es exactamente lo que shadcn da de fábrica, sin reinventar componentes.
- **Server state:** TanStack Query. **Tablas:** TanStack Table (sort/filter nativo para Leads/Deals/Vendedores). **Forms:** React Hook Form + resolver Zod (mismo schema que el backend).
- **Tokens de diseño:** tipografía Inter; fondo `gray-50`, cards blancas, texto `gray-900`; un color de acento sobrio para acciones primarias (botones negros/`gray-900`, consistente con las referencias) y colores semánticos desaturados para chips de estado (ej. lead "Hot" en rojo suave, "Cold" en azul suave, igual que la imagen de referencia de Leads).
- Layout base: sidebar fija (Dashboard, Leads, Deals/Pipeline, Empresas, Contactos, Vendedores, Actividades, Tareas, Configuración) + topbar con búsqueda global (⌘K) y perfil de usuario.

## F. Fases de construcción y testing

Se sigue el orden de prioridad F1 definido en el roadmap: auth → usuarios → **vendedores** → leads → empresas → contactos → deals/pipeline → asignación → actividades → tareas/próximo paso → búsqueda global → filtros → import/export → deduplicación → dashboard → PEN/USD → auditoría básica. F2/F3/F4 (cotizaciones, pagos, comisiones liquidadas, producción, reportes avanzados, comunicaciones, IA) quedan fuera del MVP.

- **Testing:** Vitest en ambas apps; Supertest para rutas del API; Postgres local vía `docker-compose.yml` (un único servicio, solo para que los tests de integración corran rápido y offline) — desarrollo/staging/producción siguen usando Supabase.
- **Despliegue:** `Dockerfile` para `apps/api` (portabilidad a Railway/Render/Fly/ECS); `apps/web` se despliega como build estático (Vercel/Netlify), sin Docker.
- CI (GitHub Actions) queda fuera del MVP — se agrega cuando haya que coordinar con más de una persona tocando el repo.

## Fuera de alcance del MVP (explícito)

Igual que el documento de negocio: cotizaciones/contratos, pagos y cobranza, liquidación de comisiones, producción/entregas, catálogo, reportes avanzados, permisos granulares por campo, comunicaciones (WhatsApp Business API, email), IA, integraciones externas, app móvil, RLS de base de datos, CI/CD, signup público de tenants.
