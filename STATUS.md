# Estado de la sesión — VentryCRM MVP F1

_Actualizado: 2026-09-06 (sesión 3). Archivo liviano de referencia._

## Objetivo

MVP F1 de VentryCRM (CRM multi-tenant para ROUlt), siguiendo:
- Negocio: `roult-crm-mvp-y-roadmap-v2-vendedores.md` y `modulos-crm-roult.pdf` (raíz del repo)
- Técnico: `docs/superpowers/specs/2026-09-05-ventry-crm-mvp-design.md`

Stack: monorepo npm workspaces — `apps/api` (Node/Express/TS/Prisma), `apps/web` (React/TS/Vite/Tailwind), `packages/shared` (Zod). Multi-tenant vía `tenantId` en cada tabla. Auth JWT propio con rotación de refresh tokens.

Todo el trabajo vive en el worktree `.claude/worktrees/ventry-plan1-foundation`, rama `worktree-ventry-plan1-foundation`. `master` sigue en el commit de specs (1932504) — por decisión del usuario no se mergea entre planes.

## Dónde estoy

**Plan 1 — Foundation, Auth & Vendedores: ✅ COMPLETO Y APROBADO.**
- Plan: `docs/superpowers/plans/2026-09-05-foundation-auth-team.md`
- Ledger: `.superpowers/sdd/2026-09-05-foundation-auth-team/progress.md`
- 10/10 tareas + revisión final de todo el branch (APROBADA) + verificación manual en navegador.

**Plan 2 — Leads, Empresas y Contactos: ✅ COMPLETO Y VERIFICADO.**
- Plan: `docs/superpowers/plans/2026-09-06-leads-companies-contacts.md` (commit 433fe61)
- 8/8 tareas implementadas (commits 4409e97..8ff41fb). Revisión de subagente solo para Task 7 (conversión de lead), tal como pedía el plan; su hallazgo (3 escrituras sin transacción) se corrigió en 8ff41fb.
- **Verificación end-to-end hecha en esta sesión** (API con curl + navegador real): login, CRUD de empresas/contactos/leads, detección de duplicados con confirmación, flujo de estados del lead y conversión Lead→Empresa+Contacto, todo confirmado funcionando. Doble conversión y cambio de estado sobre un lead convertido correctamente rechazados.
- **1 bug real encontrado y corregido** (commit 433fe61): los campos opcionales vacíos (`""`) rompían la validación Zod (`Invalid email`) y bloqueaban el envío de los tres diálogos — el flujo completo de aviso de duplicado en Empresas era inalcanzable. Se agregó `optionalText()` en `@ventry/shared` y mensajes de validación en español.
- Estado verde: `npm run build` limpio, 63 tests de API + 7 de web pasando.

## Decisiones pendientes del usuario (bloquean cerrar Plan 2 al 100%)

1. **No se puede descartar un lead desde la UI.** El backend acepta `UNQUALIFIED` y `LOST`, pero `NEXT_STATUS` en `LeadsPage.tsx` solo ofrece el camino lineal Nuevo → Contactado → Calificado → Convertir. Un vendedor no tiene forma de marcar un lead como perdido. El plan lo especificó así; es un hueco del plan, no del código.
2. **Un lead cuyo nombre choca con una empresa existente no se puede convertir desde la UI.** `LeadsPage` muestra el error pero no ofrece "convertir de todas formas" (`confirmDuplicate: true`), que el backend sí soporta. En Empresas y Contactos ese botón sí existe.

## Qué falta para terminar el goal

1. Resolver los dos puntos de arriba (son ~30 líneas de UI entre los dos).
2. **Plan 3** — Deals, Pipeline, Asignación de vendedor, Actividades, Tareas/próximo paso (por escribir).
3. **Plan 4** — Búsqueda global, Filtros, Import/Export, Dashboard operativo, Auditoría (por escribir).
4. Testing end-to-end final del MVP F1 completo.

## Cómo retomar

1. Leer este archivo. No hace falta releer el spec ni el PDF.
2. Postgres de pruebas: `docker compose up -d db-test` (puerto 55432). `apps/api/.env` y `apps/web/.env` existen localmente y están gitignoreados.
3. Servidores: `npm run dev:api` (4000) y `npm run dev:web` (5173). Seed: `npm run db:seed -w @ventry/api` → `admin@roult.pe` / `RoultDemo2026!`.
4. Rutas web en inglés (`/companies`, `/contacts`, `/leads`, `/team`) aunque el sidebar esté en español.

## Modo de trabajo

Autónomo salvo bloqueo real (credenciales o decisión de negocio no cubierta). Revisión ligera desde Plan 2: revisión inline propia por tarea, subagente solo para la lógica cross-entity de mayor riesgo. Modelo: opus para construir, sonnet para revisar.
