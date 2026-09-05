# ROUlt CRM — Especificación complementaria para Claude Code
## MVP + Roadmap de versiones posteriores + Gestión de vendedores

> **Este documento complementa el PDF principal de especificación de ROUlt CRM. No lo reemplaza.**
>
> El objetivo es aclarar lo que debe incorporarse al MVP para que el CRM sea realmente operativo y definir qué funcionalidades quedan para versiones posteriores.

---

# 1. Objetivo del MVP

El MVP debe permitir que ROUlt deje de depender de un tablero/manual de seguimiento y pueda gestionar dentro del CRM:

- Leads y prospectos.
- Empresas y contactos.
- Vendedores del equipo.
- Clientes y oportunidades comerciales.
- Pipeline de ventas.
- Actividades y seguimiento.
- Tareas y próximos pasos.
- Asignación de clientes/leads/deals a vendedores.
- Búsqueda y filtros.
- Importación/exportación de datos.
- Detección básica de duplicados.
- Dashboard operativo.
- Usuarios y acceso básico.
- Manejo correcto de PEN y USD.
- Historial básico de cambios.

El MVP debe priorizar la operación comercial diaria. Las funciones financieras, producción, documentos, comunicaciones avanzadas, reportes avanzados e IA se desarrollarán posteriormente.

---

# 2. Lo que ya está definido en el PDF principal

El documento principal ya establece como base:

1. Clientes y contactos.
2. Pipeline de ventas.
3. Mantenimientos y suscripciones.
4. Tareas y seguimiento.
5. Cotizaciones y contratos.
6. Pagos y cobranza.
7. Comisiones del vendedor.
8. Producción y entregas.
9. Reportes.
10. Catálogo de servicios y precios.
11. Usuarios y permisos.
12. Comunicaciones.

También establece las fases F1, F2 y F3, y la regla fundamental:

> Cada dato debe escribirse una sola vez y los demás módulos deben leerlo.

Por ejemplo:

- El pago registra el monto real.
- La comisión se calcula a partir del pago.
- Los reportes suman la información existente.
- No se debe volver a escribir manualmente el mismo monto en diferentes módulos.

---

# 3. Cambio importante: gestión explícita de VENDEDORES

## 3.1. Problema

El PDF contempla vendedores dentro de usuarios/permisos y contempla el cálculo de sus comisiones, pero no especifica suficientemente una sección operativa para:

- Registrar vendedores.
- Administrarlos.
- Activarlos/desactivarlos.
- Asignarles leads.
- Asignarles clientes.
- Asignarles deals.
- Consultar su actividad comercial.
- Consultar sus ventas.
- Consultar sus comisiones.

Por lo tanto, el MVP debe incorporar explícitamente la gestión de vendedores.

---

# 4. Módulo MVP: Equipo / Vendedores

## 4.1. Concepto

Un vendedor debe ser un **usuario interno del CRM con rol de Vendedor**.

No se debe crear un sistema de cuentas separado para vendedores.

La estructura conceptual debe ser:

```text
Empresa ROUlt
│
├── Usuarios
│   ├── Administrador
│   ├── Vendedor
│   └── Otros roles futuros
│
└── Vendedores
    ├── Vendedor 1
    ├── Vendedor 2
    └── Vendedor 3
```

La sección **Vendedores** puede funcionar como una vista especializada del equipo, mientras que técnicamente cada vendedor sigue siendo un usuario.

---

# 5. Registro de un vendedor

El administrador debe poder crear un vendedor desde:

**Configuración → Equipo / Vendedores**

Campos mínimos:

- Nombre.
- Apellido.
- Email.
- Teléfono.
- Foto/avatar opcional.
- Estado: Activo / Inactivo.
- Fecha de ingreso.
- Porcentaje de comisión.
- Rol: Vendedor.
- Usuario/login asociado.

### Comisión

El porcentaje de comisión debe tener un valor predeterminado de:

**20%**

Pero debe almacenarse por vendedor y poder configurarse posteriormente.

La lógica de comisiones debe respetar el documento principal: la comisión se calcula sobre **pagos reales registrados**, no sobre promesas o ventas todavía no cobradas.

---

# 6. Estado del vendedor

Cada vendedor debe tener:

### Activo

Puede:

- Iniciar sesión.
- Recibir leads.
- Ser asignado a clientes.
- Ser asignado a deals.
- Crear/actualizar actividades permitidas.
- Gestionar su pipeline.
- Consultar sus comisiones según sus permisos.

### Inactivo

No debe poder recibir nuevas asignaciones.

Sus registros históricos **NO deben eliminarse**.

Por ejemplo:

```text
Juan Pérez
Estado: Inactivo

Histórico:
- 24 clientes
- 17 deals
- S/ 45,000 en ventas
- S/ 9,000 en comisiones
```

Desactivar un vendedor nunca debe borrar sus clientes, deals, pagos o comisiones.

---

# 7. Relaciones del vendedor

El vendedor debe poder relacionarse con:

```text
Vendedor
   │
   ├── Leads asignados
   ├── Empresas asignadas
   ├── Contactos relacionados
   ├── Deals asignados
   ├── Actividades
   ├── Tareas
   └── Comisiones
```

Esto permite que el CRM pueda responder preguntas como:

- ¿Qué clientes tiene Juan?
- ¿Qué leads tiene pendientes?
- ¿Qué deals tiene abiertos?
- ¿Cuál es su siguiente tarea?
- ¿Cuánto ha vendido?
- ¿Cuánto ha cobrado?
- ¿Cuánto ha generado en comisión?

---

# 8. Asignación de vendedor

En los registros comerciales debe existir un campo:

**Vendedor asignado**

Como mínimo debe estar disponible en:

- Lead.
- Empresa/cliente.
- Deal.
- Actividad.
- Tarea.

Ejemplo:

```text
Lead
Empresa: ABC SAC
Contacto: Carlos Pérez
Línea: Web
Origen: Referido
Vendedor asignado: Juan Pérez
```

Cuando un lead se convierte en cliente/deal, el vendedor asignado debe conservarse automáticamente salvo que un administrador lo cambie.

---

# 9. Reasignación

El administrador debe poder cambiar el vendedor asignado.

Ejemplo:

```text
ABC SAC
Vendedor actual: Juan Pérez

Cambiar a:
[ María López ▼ ]
```

El cambio no debe borrar el historial anterior.

El sistema debe registrar:

```text
Juan Pérez → María López
Fecha
Usuario que realizó el cambio
```

Esto es especialmente importante para auditoría y futuras estadísticas.

---

# 10. Vista de Vendedores

La sección debe mostrar una tabla/listado similar a:

| Vendedor | Estado | Leads | Clientes | Deals activos | Ventas | Comisión |
|---|---|---:|---:|---:|---:|---:|
| Juan Pérez | Activo | 12 | 18 | 6 | S/ 32,000 | S/ 6,400 |
| María López | Activo | 9 | 14 | 4 | S/ 24,000 | S/ 4,800 |

Los indicadores monetarios deben respetar la separación PEN/USD.

No se debe sumar S/ y USD como si fueran una misma moneda.

---

# 11. Perfil del vendedor

Al entrar al vendedor, el administrador debe poder consultar:

### Información

- Datos personales/profesionales.
- Estado.
- Fecha de ingreso.
- Comisión configurada.

### Actividad comercial

- Leads asignados.
- Clientes.
- Deals abiertos.
- Deals ganados.
- Deals perdidos.
- Actividades.
- Tareas pendientes.
- Tareas vencidas.

### Ventas

- Ventas cerradas.
- Ventas por línea: Web / Software.
- Ventas por período.
- PEN separado de USD.

### Comisiones

- Comisión generada.
- Comisión pendiente.
- Comisión pagada.

El detalle avanzado de liquidaciones pertenece a F2.

---

# 12. Permisos del vendedor

En el MVP debe existir al menos una diferenciación básica:

## Administrador

Puede:

- Ver todos los vendedores.
- Crear vendedores.
- Editar vendedores.
- Desactivar vendedores.
- Asignar/reasignar leads.
- Asignar/reasignar clientes.
- Asignar/reasignar deals.
- Ver información global.

## Vendedor

Puede:

- Ver sus leads.
- Ver sus clientes asignados.
- Ver sus deals.
- Crear/actualizar información permitida.
- Gestionar sus actividades.
- Gestionar sus tareas.
- Ver su propio pipeline.
- Ver su información comercial.

El sistema de permisos avanzado queda para F3.

---

# 13. Leads — módulo que también debe existir explícitamente en el MVP

El PDF utiliza el origen del lead, pero el MVP debe modelar explícitamente el concepto de Lead.

Estados mínimos:

```text
Nuevo
↓
Contactado
↓
Calificado
↓
Convertido
```

También:

```text
No calificado
Perdido
```

Un Lead debe contener como mínimo:

- Nombre de empresa/persona.
- Contacto.
- Teléfono/WhatsApp.
- Email.
- Línea: Web / Software.
- Origen.
- Vendedor asignado.
- Estado.
- Notas.
- Fecha de creación.

Al convertirse, el sistema debe evitar crear una persona/empresa duplicada.

---

# 14. Empresa vs Contacto vs Lead vs Deal

Estas entidades deben estar separadas conceptualmente.

## Empresa

Representa el negocio/organización.

Ejemplo:

```text
ABC SAC
```

## Contacto

Representa una persona perteneciente a la empresa.

```text
Carlos Pérez
Gerente
ABC SAC
```

## Lead

Representa una oportunidad/prospecto que todavía no está convertido en una relación comercial formal.

## Deal

Representa una oportunidad comercial concreta.

Ejemplo:

```text
ABC SAC
Web corporativa
S/ 8,000
Etapa: Negociación
Vendedor: Juan Pérez
```

No crear una nueva empresa/contacto cada vez que el mismo prospecto vuelva a contactar.

---

# 15. Actividades e historial

El CRM debe registrar actividades relacionadas con clientes, leads y deals.

Tipos iniciales:

- Llamada.
- Reunión.
- Nota.
- Seguimiento.
- Tarea.
- Cambio de etapa.

Campos:

- Tipo.
- Fecha.
- Usuario responsable.
- Registro relacionado.
- Descripción.
- Estado.

Esto permitirá tener una línea temporal:

```text
04/09 — Juan envió propuesta
05/09 — Cliente respondió
06/09 — Reunión programada
07/09 — Seguimiento pendiente
```

---

# 16. Regla de próximo paso

Todo cliente/deal activo debe poder tener un:

**Próximo paso**

Con:

- Descripción.
- Responsable.
- Fecha.

Ejemplo:

```text
Próximo paso:
Llamar para confirmar propuesta

Responsable:
Juan Pérez

Fecha:
08/09/2026
```

Los vencidos deben destacarse visualmente.

La vista **Mi día** debe mostrar las tareas del vendedor correspondiente.

---

# 17. Búsqueda global

El MVP debe tener búsqueda global.

Debe permitir encontrar:

- Empresas.
- Contactos.
- Leads.
- Deals.
- Vendedores.

Ejemplo:

```text
Buscar: ABC
```

Resultados:

```text
ABC SAC
Carlos Pérez
Deal #104
Juan Pérez
```

---

# 18. Filtros

Como mínimo:

### Leads

- Estado.
- Vendedor.
- Línea.
- Origen.

### Clientes

- Vendedor.
- Línea.
- Estado.

### Deals

- Vendedor.
- Etapa.
- Línea.
- Moneda.
- Fecha.

### Vendedores

- Estado.
- Cantidad de leads.
- Cantidad de clientes.
- Ventas.

---

# 19. Importación y exportación

Para migrar el tablero actual al CRM, el MVP debe permitir:

### Importar

CSV / Excel.

Como mínimo:

- Empresas.
- Contactos.
- Leads.
- Deals.
- Vendedores.

La importación debe incluir una vista previa antes de confirmar.

Debe intentar detectar duplicados antes de crear registros.

### Exportar

Permitir exportar información a CSV/Excel según filtros.

---

# 20. Deduplicación

El CRM debe evitar duplicados.

Criterios iniciales:

1. Email.
2. Número de teléfono/WhatsApp.
3. Identificador externo si existe.
4. Combinación nombre + empresa como criterio auxiliar.

No realizar fusiones automáticas destructivas.

Cuando exista una posible coincidencia:

```text
Posible duplicado encontrado

ABC SAC
vs.
ABC SAC

[Revisar]
```

El administrador decide si fusiona.

---

# 21. Monedas

ROUlt trabaja con soles y dólares.

Cada cantidad monetaria debe almacenar:

```text
amount
currency
```

Ejemplo:

```text
amount: 5000
currency: PEN
```

o:

```text
amount: 2000
currency: USD
```

No convertir automáticamente ni sumar PEN y USD.

Los dashboards deben mostrar:

```text
Ventas
PEN: S/ 45,000
USD: $12,000
```

---

# 22. Pipeline del MVP

El pipeline definido en el PDF debe mantenerse:

```text
Contacto
→ Propuesta/Maqueta
→ Negociación
→ Adelanto
→ Producción
→ Entregado
→ Mantenimiento
```

También:

```text
Perdido
```

Al marcar un deal como perdido debe solicitarse:

**Motivo de pérdida**

Los deals perdidos nunca deben eliminarse.

---

# 23. Dashboard operativo del MVP

No hace falta construir todavía todos los reportes avanzados de F3.

El MVP sí debe tener una vista básica para el administrador y una vista adaptada para vendedores.

### Administrador

- Leads nuevos.
- Deals activos.
- Deals ganados.
- Deals perdidos.
- Próximas tareas.
- Tareas vencidas.
- Clientes activos.
- MRR.
- Actividad de vendedores.

### Vendedor

- Mis leads.
- Mis deals.
- Mis tareas.
- Próximos pasos.
- Deals ganados.
- Clientes asignados.

PEN y USD deben permanecer separados.

---

# 24. Login y usuarios básicos

Aunque el módulo completo de usuarios/permisos pertenece a F3, el MVP necesita autenticación básica.

Como mínimo:

- Login.
- Usuario.
- Email.
- Contraseña.
- Rol.
- Estado.
- Vendedor asociado cuando corresponda.

Roles iniciales:

```text
ADMIN
VENDEDOR
```

No es necesario implementar todavía un sistema complejo de permisos por módulo/campo.

---

# 25. Auditoría mínima

El MVP debe guardar como mínimo:

- Quién creó un registro.
- Fecha de creación.
- Quién lo modificó.
- Fecha de modificación.
- Cambios importantes de asignación.
- Cambios de etapa.

Ejemplo:

```text
05/09/2026
Juan Pérez → María López
Cambio de vendedor
Realizado por: Admin
```

La auditoría detallada por campo puede ampliarse en F3.

---

# 26. Qué NO construir en el MVP

Para evitar sobrecargar la primera versión, NO es necesario implementar todavía:

- Generador avanzado de cotizaciones.
- Firma electrónica.
- Gestión completa de contratos.
- Registro completo de pagos.
- Liquidaciones de comisiones.
- Producción avanzada.
- Entregas avanzadas.
- Catálogo completo.
- WhatsApp Business API.
- Inbox omnicanal.
- Automatizaciones complejas.
- Marketing automation.
- Tickets de soporte.
- IA.
- Marketplace de integraciones.
- App móvil.

Estas funciones se construyen posteriormente sobre la base de datos del MVP.

---

# 27. F2 — Operación financiera y producción

Una vez validado el CRM operativo, construir:

## 27.1. Cotizaciones y contratos

- Plantillas.
- Datos del cliente.
- Paquetes.
- Precio.
- Estado: borrador/enviado/firmado.
- Fecha de firma.
- Documento adjunto.

El precio debe provenir del catálogo cuando este exista.

---

## 27.2. Pagos y cobranza

Registrar pagos reales:

- Adelanto 50%.
- Pago final 50%.
- Mantenimiento mensual.
- Automatizaciones u otros pagos.

Campos:

- Monto.
- Moneda.
- Concepto.
- Método.
- Fecha.
- Comprobante opcional.
- Estado/verificación.

El saldo pendiente debe calcularse automáticamente.

---

## 27.3. Comisiones

El PDF define una comisión del vendedor de 20%.

La lógica debe ser:

```text
Pago real
↓
Comisión correspondiente
↓
Comisión acumulada
↓
Liquidación
```

Nunca:

```text
Deal prometido
↓
Comisión inmediata
```

Debe existir detalle de:

- Vendedor.
- Pago relacionado.
- Concepto.
- Comisión generada.
- Estado: pendiente/pagada.
- Liquidación.

---

## 27.4. Producción y entregas

Crear un registro de producción asociado al deal.

Checklist:

- Logo.
- Fotos.
- Lista de precios.
- Horarios.
- Accesos.
- Dominio elegido.
- Fecha de material completo.
- Deadline.
- Rondas de ajuste.
- Estado de entrega.

La producción debe evolucionar hacia una entidad/proyecto independiente del deal comercial.

---

# 28. F3 — Escala y administración avanzada

## Reportes

Incorporar:

- Ventas cerradas por mes.
- Ventas por línea.
- MRR.
- Crecimiento MRR.
- Funnel.
- Ranking de vendedores.
- Conversión.
- Ticket promedio.
- Duración del ciclo de venta.
- MRR perdido/churn.
- Cobranza.

---

## Catálogo

- Servicios.
- Paquetes.
- Mantenimientos.
- Automatizaciones.
- Precio.
- Descripción.
- Estado activo/retirado.

Cambiar el precio actual del catálogo **no debe modificar contratos ya firmados**.

---

## Usuarios y permisos avanzados

Permitir:

- Roles personalizados.
- Permisos por módulo.
- Permisos de lectura/escritura.
- Restricciones de información.
- Acceso de producción sin información financiera.
- Auditoría detallada.

El PDF ya contempla que el vendedor no debe visualizar costos internos y que producción puede trabajar sin información monetaria.

---

## Comunicaciones

Integrar:

- WhatsApp Business API.
- Email.
- Plantillas.
- Variables.
- Historial de conversaciones.
- Última interacción.

Las plantillas pueden incluir:

- Seguimiento.
- Cobranza.
- Solicitud de materiales.
- Confirmaciones.

El botón simple de "Abrir WhatsApp" puede existir antes, pero la integración completa pertenece a esta fase.

---

# 29. F4 — Inteligencia artificial

La arquitectura debe dejar preparada la información para incorporar IA posteriormente.

No es necesario construir IA para el MVP.

Funciones futuras:

### AI Assistant

Preguntas como:

> ¿Qué deals necesitan seguimiento hoy?

> ¿Qué vendedor tiene más oportunidades abiertas?

> ¿Cuánto vendimos este mes?

### Lead Scoring

Clasificación automática de prospectos según probabilidad de conversión.

### Deal Intelligence

Detectar:

- Deals estancados.
- Riesgo de pérdida.
- Falta de actividad.
- Próxima acción recomendada.

### Resúmenes

- Conversaciones.
- Reuniones.
- Historial del cliente.

### Generación

- Emails.
- Mensajes de WhatsApp.
- Seguimientos.
- Resúmenes comerciales.

### AI Reports

Preguntas en lenguaje natural sobre los datos del CRM.

---

# 30. Integraciones futuras

La arquitectura debe poder integrarse posteriormente con:

- Gmail.
- Outlook.
- Google Calendar.
- Microsoft Calendar.
- WhatsApp Business API.
- Zoom.
- Google Meet.
- Microsoft Teams.
- Stripe.
- PayPal.
- Google Drive.
- OneDrive.
- Dropbox.
- Slack.
- Zapier.
- Make.
- APIs externas.

Estas integraciones no deben bloquear el MVP.

---

# 31. Fuente única de verdad

Esta regla es fundamental para toda la arquitectura.

Cada información debe tener una única fuente.

Ejemplo:

```text
CLIENTE
   ↓
DEAL
   ↓
PAGO
   ↓
COMISIÓN
   ↓
REPORTE
```

No copiar manualmente la información entre módulos.

Ejemplo incorrecto:

```text
Deal → monto
Pago → monto
Comisión → monto
Reporte → monto
```

Cada módulo debe consultar la información correspondiente.

La lógica correcta:

```text
Deal → oportunidad comercial
Pago → dinero realmente recibido
Comisión → cálculo basado en pagos
Reporte → agregación de datos existentes
```

---

# 32. Arquitectura funcional recomendada

La estructura conceptual del CRM debe quedar preparada para crecer:

```text
Workspace / Empresa
│
├── Usuarios
│   ├── Admin
│   └── Vendedores
│
├── Leads
│
├── Empresas
│
├── Contactos
│
├── Deals
│   └── Pipeline
│
├── Actividades
│
├── Tareas
│
├── Mantenimientos
│
├── Cotizaciones        [F2]
├── Contratos           [F2]
├── Pagos               [F2]
├── Comisiones          [F2]
├── Producción          [F2]
│
├── Reportes            [F3]
├── Catálogo            [F3]
├── Permisos avanzados  [F3]
├── Comunicaciones      [F3]
│
└── IA                   [F4]
```

---

# 33. Flujo principal del MVP

El flujo esperado debe ser:

```text
Lead entra
   ↓
Se identifica/evita duplicado
   ↓
Se asigna vendedor
   ↓
Vendedor contacta
   ↓
Lead se califica
   ↓
Se convierte
   ↓
Empresa + Contacto + Deal
   ↓
Deal entra al Pipeline
   ↓
Vendedor gestiona actividades
   ↓
Siempre existe próximo paso
   ↓
Deal avanza
   ↓
Deal ganado
```

Después, en F2:

```text
Deal ganado
   ↓
Cotización/Contrato
   ↓
Pago
   ↓
Comisión
   ↓
Producción
   ↓
Entrega
   ↓
Mantenimiento
```

---

# 34. Prioridad final de desarrollo

## MVP — F1

Construir primero:

1. Autenticación básica.
2. Usuarios.
3. **Vendedores.**
4. Leads.
5. Empresas.
6. Contactos.
7. Deals.
8. Pipeline.
9. Asignación de vendedores.
10. Actividades.
11. Tareas.
12. Próximo paso obligatorio.
13. Búsqueda global.
14. Filtros.
15. Importación.
16. Exportación.
17. Deduplicación.
18. Dashboard operativo.
19. Manejo PEN/USD.
20. Auditoría básica.

### Resultado esperado

Al terminar F1, ROUlt debe poder operar su proceso comercial diario completamente dentro del CRM.

---

## F2 — Operación

1. Cotizaciones.
2. Contratos.
3. Pagos.
4. Cobranza.
5. Comisiones.
6. Producción.
7. Entregas.
8. Automatizaciones básicas.

---

## F3 — Escala

1. Reportes avanzados.
2. Catálogo.
3. Usuarios/permisos avanzados.
4. Comunicaciones.
5. WhatsApp Business API.
6. Email integrado.
7. Calendarios.
8. Automatizaciones avanzadas.

---

## F4 — Inteligencia

1. AI Assistant.
2. Lead Scoring.
3. Deal Intelligence.
4. Next Best Action.
5. Resúmenes automáticos.
6. Generación de emails/mensajes.
7. AI Reports.
8. AI Workflow Builder.
9. AI Sales Agent.

---

# 35. Instrucción final para Claude Code

El PDF principal y este documento deben interpretarse conjuntamente.

**No reemplazar las reglas de negocio ya definidas en el PDF.**

Este documento agrega principalmente:

- Definición explícita de Leads.
- Separación entre Empresa, Contacto, Lead y Deal.
- Actividades e historial.
- Búsqueda.
- Filtros.
- Importación/exportación.
- Deduplicación.
- Manejo correcto de monedas.
- Login básico.
- Auditoría mínima.
- Dashboard operativo.
- **Gestión completa de vendedores en el MVP.**
- Roadmap claro para F2, F3 y F4.

La implementación debe priorizar:

**1. Correctitud de los datos.  
2. Flujo comercial de ROUlt.  
3. Relación entre vendedor → lead → cliente → deal.  
4. No duplicar información.  
5. Escalabilidad de la arquitectura.  
6. UX simple para uso diario.**

No construir funcionalidades de fases posteriores antes de completar el flujo funcional del MVP.
