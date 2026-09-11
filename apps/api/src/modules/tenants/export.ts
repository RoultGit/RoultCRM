import { prisma } from '../../lib/prisma.js';
import { ForbiddenError } from '../../lib/errors.js';
import type { Actor } from '../../lib/scope.js';

/**
 * Todo lo que la empresa cargó, en un solo archivo.
 *
 * Existe por tres razones distintas y todas cuentan: la ley 29733 le da al titular el derecho de
 * acceder a sus datos; un cliente que evalúa contratar pregunta si puede llevárselos; y es la red
 * de seguridad de quien no quiere depender de que el backup de otro funcione.
 *
 * NO incluye contraseñas, tokens de sesión, claves de API ni credenciales de WhatsApp: eso no son
 * "sus datos", son las llaves del sistema, y un archivo que circula por correo no es lugar para ellas.
 */
export async function exportTenantData(actor: Actor): Promise<Record<string, unknown>> {
  if (actor.role !== 'ADMIN') throw new ForbiddenError('Solo un administrador puede exportar los datos');
  const tenantId = actor.tenantId;

  const [
    tenant,
    users,
    companies,
    contacts,
    leads,
    deals,
    quotes,
    installments,
    tasks,
    taskUpdates,
    activities,
    customFields,
    customValues,
    attachments,
    automations,
    pipelineStages,
    auditLog,
  ] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, name: true, createdAt: true } }),
    prisma.user.findMany({
      where: { tenantId },
      // Sin passwordHash: es la llave, no el dato.
      select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, phone: true, commissionPct: true, hireDate: true, createdAt: true },
    }),
    prisma.company.findMany({ where: { tenantId } }),
    prisma.contact.findMany({ where: { tenantId } }),
    prisma.lead.findMany({ where: { tenantId } }),
    prisma.deal.findMany({ where: { tenantId } }),
    prisma.quote.findMany({ where: { tenantId }, include: { items: true } }),
    prisma.installment.findMany({ where: { tenantId } }),
    prisma.task.findMany({ where: { tenantId } }),
    prisma.taskUpdate.findMany({ where: { tenantId } }),
    prisma.activity.findMany({ where: { tenantId } }),
    prisma.customField.findMany({ where: { tenantId } }),
    prisma.customFieldValue.findMany({ where: { tenantId } }),
    // Solo la ficha técnica: los bytes viven en el almacenamiento y se bajan uno por uno desde la
    // ficha. Meterlos acá haría un archivo de gigabytes que nadie puede abrir.
    prisma.attachment.findMany({
      where: { tenantId },
      select: { id: true, relatedType: true, relatedId: true, name: true, size: true, mimeType: true, createdAt: true },
    }),
    prisma.automation.findMany({ where: { tenantId } }),
    prisma.pipelineStage.findMany({ where: { tenantId } }),
    prisma.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 5000 }),
  ]);

  return {
    exportadoEl: new Date().toISOString(),
    empresa: tenant,
    // El nombre de cada clave dice qué es, para que el archivo se entienda sin documentación.
    equipo: users,
    clientes: companies,
    contactos: contacts,
    leads,
    ventas: deals,
    cotizaciones: quotes,
    cuotasDeCobranza: installments,
    tareas: tasks,
    avancesDeTareas: taskUpdates,
    historialDeInteracciones: activities,
    camposPropios: customFields,
    valoresDeCamposPropios: customValues,
    archivosAdjuntos: attachments,
    automatizaciones: automations,
    etapasDelPipeline: pipelineStages,
    registroDeAuditoria: auditLog,
  };
}
