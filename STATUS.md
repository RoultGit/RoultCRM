# Estado de la sesión — VentryCRM MVP F1

_Actualizado: 2026-09-06 (sesión 3). Archivo liviano de referencia._

## Objetivo

MVP F1 de VentryCRM (CRM multi-tenant para ROUlt), siguiendo:
- Negocio: `roult-crm-mvp-y-roadmap-v2-vendedores.md` y `modulos-crm-roult.pdf` (raíz del repo)
- Técnico: `docs/superpowers/specs/2026-09-05-ventry-crm-mvp-design.md`

Stack: monorepo npm workspaces — `apps/api` (Node/Express/TS/Prisma), `apps/web` (React/TS/Vite/Tailwind), `packages/shared` (Zod). Multi-tenant vía `tenantId` en cada tabla. Auth JWT propio con rotación de refresh tokens.

**Repo:** https://github.com/RoultGit/RoultCRM — todo en `master`.
**App:** https://roult-crm.vercel.app (equipo ROULT, proyecto `roult-crm`).
**Base:** Supabase `frconarrihakjwynibrp`, región us-east-1. RLS activo y permisos revocados a `anon`/`authenticated`.

Vercel despliega solo con cada push a `master` — ya no se suben archivos a mano.

Un solo proyecto de Vercel sirve el frontend y la API: el SPA en la raíz y Express como función en `/api`. Comparten origen, así que no hay CORS que mantener ni cookie cross-site.

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

**Plan 3 — Deals, Pipeline, Asignación y Tareas: ✅ COMPLETO, con 1 bug conocido abierto.**
- Plan: `docs/superpowers/plans/2026-09-06-deals-pipeline-tareas.md` (10 tareas)
- Entregado: modelos `Deal`/`Task`/`AssignmentHistory`; scoping por dueño en leads, empresas, contactos y deals (un VENDEDOR solo ve lo suyo); pipeline de 8 etapas con motivo de pérdida obligatorio; asignación con historial; `GET /auth/me` + `useSession`; tablero kanban; página "Mi día"; asignación de vendedor en Leads y Empresas.
- Verde: `npm run build` limpio, 103 tests de API + 13 de web.
- **Revisión de subagente (Tarea 2, la de seguridad): 1 Critical real encontrado y corregido.** `findPossibleDuplicate` devolvía el DTO completo de una empresa o contacto de otro vendedor en el 409 de duplicado — un oráculo de datos por el flujo normal de uso. Ahora el choque se avisa sin mostrar la ficha ajena (`canSee()` en `lib/scope.ts`).
- Otros arreglos de esa ronda: leads no validaba `assignedUserId`; contactos no tenía ningún test de scoping; la suite de API fallaba 1 de cada 3 corridas por paralelismo entre archivos sobre el mismo Postgres (`fileParallelism: false`).
- Bugs encontrados en la verificación manual y corregidos:
  - Fechas mostradas un día antes (fecha de calendario guardada como medianoche UTC, leída en zona local). `lib/date.ts` + tests.
  - **Sin guard de ruta**: entrar a cualquier página sin sesión pintaba todo vacío en silencio en vez de mandar al login. Era un pendiente de Plan 1.
  - **El tablero scrolleaba la página entera de costado** en vez de su propio strip (faltaba `min-w-0` en el `<main>` del AppShell), así que durante un arrastre la página se movía debajo del cursor y el deal caía varias columnas más allá. Además la detección de colisión ahora va por cursor (`pointerWithin`) y no por el rectángulo de la card, y la card arrastrada usa `DragOverlay`.

**Plan 4 — Búsqueda, Filtros, Import/Export, Dashboard y Auditoría: ✅ COMPLETO.**
- Plan: `docs/superpowers/plans/2026-09-06-busqueda-filtros-import-dashboard.md` (11 tareas)
- Entregado: búsqueda global con ⌘K en la topbar; filtros en Leads/Empresas/Deals/Vendedores; exportación CSV que respeta los filtros; importación CSV con vista previa; dashboard operativo; auditoría (el modelo `AuditLog` existía desde Plan 1 y nunca se escribía).
- Verde: `npm run build` limpio, 157 tests de API + 15 de web.
- **Dos authorization bypass encontrados por revisión y corregidos:**
  1. Los filtros ponían `...owner` y `...filters` como dos spreads en el mismo objeto: `?assignedUserId=<otro>` **pisaba** el scoping y un vendedor leía la cartera de un colega. Ahora van en `AND`.
  2. La importación de contactos no validaba que `companyId` fuera del tenant: importar con el id de una empresa ajena creaba un contacto que aparecía en tu lista mostrando el nombre de la empresa de otro tenant. Reproducido en vivo por el revisor.
- Otros arreglos: inyección de fórmulas en CSV (`=cmd|...` en un nombre de empresa se ejecutaba al abrir el Excel); la detección de duplicados de leads releía toda la tabla una vez por fila; `express.json()` rechazaba con un 500 opaco un archivo del tamaño que la propia API declara soportar; se quitó la FK de `AuditLog.userId` (un log histórico no debe depender de que la fila del usuario exista) que además hacía la suite intermitente.

## Decisiones de alcance tomadas en Plan 4

- **"Deals ganados"** no tiene etapa propia en el pipeline: se definió ganado = el cliente ya pagó (`ADELANTO` en adelante). Vive en `DEAL_STAGE_GROUPS` en `@ventry/shared`, cambiarlo es una línea.
- **MRR queda fuera**: no hay modelo de ingreso recurrente en el MVP, no hay nada que sumar.
- **Import/export solo CSV**, no Excel.
- **No se importan Deals ni Vendedores**: un deal necesita resolver su empresa por nombre y un vendedor necesita credenciales.

## Después de los 4 planes (sesiones 4 y 5)

El producto pasó de "MVP interno de ROUlt" a "SaaS que se le vende a otras empresas". Lo agregado,
en orden: rendimiento del arrastre en el pipeline; borrado de deals y de empresas; gráficos del
dashboard (Recharts); módulo de calendario propio (día y mes, sin librería); tareas como tablero +
línea de tiempo, con prioridad, autoría, asignación y bitácora de avance; responsive en las 10
rutas; cobro mensual/suscripción; líneas AUTOMATIZACION y SERVICIO; nombre del representante;
renombre a RoultCRM; alta de entidades cliente con `isPlatformOwner`; gestión de contraseñas
completa (cambio, forzado, olvido, reseteo); historial de interacciones (`Activity`); ficha 360 del
cliente; click-to-WhatsApp; API pública de captación de leads (`/intake`).

Y lo último, las 5 cosas que faltaban para venderlo:

1. **Un correo puede estar en varias empresas.** El índice único de `User.email` pasó a ser
   `[tenantId, email]`. El login busca por correo sin saber la empresa, y si el mismo correo con la
   misma contraseña existe en dos, devuelve la lista para elegir.
2. **Campos propios** (`CustomField` / `CustomFieldValue`): el admin los define por tipo de ficha en
   `/custom-fields`, y aparecen en la ficha de la empresa y en los diálogos de edición de lead,
   venta, contacto y empresa. El valor se guarda como texto y el tipo se valida al guardar.
3. **Recordatorios diarios**: cron de Vercel a las 13:00 UTC (8am Lima) → un correo por persona con
   sus tareas y próximos pasos vencidos o de hoy. `User.lastDigestAt` evita el duplicado.
4. **WhatsApp Business** (`WhatsAppAccount`): cada empresa cliente conecta SU número desde
   Conexiones. Token cifrado con AES-256-GCM (`lib/secretBox.ts`, `ENCRYPTION_KEY`). El webhook
   verifica la firma HMAC de Meta y falla cerrado. Lo entrante cae en la ficha del contacto o lead
   por los últimos 9 dígitos del número, y si no matchea con nadie, crea un lead.
5. **Correo de salida**: el código está (`lib/mailer.ts`, Resend por `fetch`), falta la cuenta.

**Verde:** 319 tests de API + 24 de web. Simulación de empresa cliente (`empresa.mjs`, 15 etapas) y
recorrido de pantallas (`navegador.mjs`) sin fallas.

**Lo que falta configurar afuera está en `docs/PUESTA-EN-MARCHA.md`**: `ENCRYPTION_KEY` y
`CRON_SECRET` (valores ya generados ahí), la cuenta de Resend y la de Meta.

## Qué falta para terminar el goal

1. Cargar las variables de entorno de `docs/PUESTA-EN-MARCHA.md` en Vercel.
2. Crear las cuentas de Resend y de Meta.

## Cómo retomar

1. Leer este archivo. No hace falta releer el spec ni el PDF.
2. Postgres de pruebas: `docker compose up -d db-test` (puerto 55432). `apps/api/.env` y `apps/web/.env` existen localmente y están gitignoreados.
3. Servidores: `npm run dev:api` (4000) y `npm run dev:web` (5173). Seed: `npm run db:seed -w @ventry/api` → `admin@roult.pe` / `RoultDemo2026!`.
4. Rutas web en inglés (`/companies`, `/contacts`, `/leads`, `/deals`, `/tasks`, `/team`) aunque el sidebar esté en español.
5. Usuarios de prueba: `admin@roult.pe` / `RoultDemo2026!` (ADMIN) y `juan@roult.pe` / `JuanDemo2026!` (VENDEDOR, para probar el aislamiento).

## Modo de trabajo

Autónomo salvo bloqueo real (credenciales o decisión de negocio no cubierta). Revisión ligera desde Plan 2: revisión inline propia por tarea, subagente solo para la lógica cross-entity de mayor riesgo. Modelo: opus para construir, sonnet para revisar.
