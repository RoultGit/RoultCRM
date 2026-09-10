import { prisma } from '../../lib/prisma.js';
import { sendEmail, dailyDigestEmail, webOrigin } from '../../lib/mailer.js';

export interface DigestItem {
  kind: 'TASK' | 'NEXT_STEP';
  /** De qué empresa cliente salió. Se compara con la del destinatario antes de mandar nada. */
  tenantId: string;
  title: string;
  /** Contexto: la empresa de la venta, o la ficha a la que cuelga la tarea. */
  subtitle?: string;
  dueDate: Date;
  link: string;
}

export interface Digest {
  userId: string;
  email: string;
  name: string;
  items: DigestItem[];
}

/** Medianoche UTC del día siguiente: todo lo que venza antes es de hoy o está vencido. */
function endOfToday(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function sameUtcDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/**
 * Lo que a cada persona se le vence hoy o ya se le venció.
 *
 * Un solo correo por persona y por día con TODO junto, y no uno por tarea: cinco correos a las 8am
 * se archivan sin leer, y el que importa se pierde entre los otros cuatro.
 */
export async function buildDigests(now = new Date(), incluirYaEnviados = false): Promise<Digest[]> {
  const limite = endOfToday(now);
  const origin = webOrigin();

  const [tasks, deals] = await Promise.all([
    prisma.task.findMany({
      where: { status: { not: 'DONE' }, dueDate: { lt: limite } },
      select: { id: true, tenantId: true, title: true, dueDate: true, ownerId: true },
    }),
    prisma.deal.findMany({
      where: {
        nextStepDate: { lt: limite },
        // Una venta cerrada o perdida ya no tiene próximo paso que recordar.
        stage: { notIn: ['ENTREGADO', 'PERDIDO'] },
      },
      select: {
        id: true,
        tenantId: true,
        title: true,
        nextStepDescription: true,
        nextStepDate: true,
        nextStepOwnerId: true,
        assignedUserId: true,
        company: { select: { name: true } },
      },
    }),
  ]);

  const porUsuario = new Map<string, DigestItem[]>();
  const push = (userId: string | null, item: DigestItem) => {
    if (!userId) return;
    const lista = porUsuario.get(userId) ?? [];
    lista.push(item);
    porUsuario.set(userId, lista);
  };

  for (const task of tasks) {
    push(task.ownerId, {
      kind: 'TASK',
      tenantId: task.tenantId,
      title: task.title,
      dueDate: task.dueDate,
      link: `${origin}/tasks`,
    });
  }
  for (const deal of deals) {
    // Si nadie quedó a cargo del paso, le toca a quien lleva la venta: sin este respaldo el
    // recordatorio no le llega a nadie, que es justo cuando más falta hace.
    push(deal.nextStepOwnerId ?? deal.assignedUserId, {
      kind: 'NEXT_STEP',
      tenantId: deal.tenantId,
      title: deal.nextStepDescription || deal.title,
      subtitle: deal.company.name,
      dueDate: deal.nextStepDate as Date,
      link: `${origin}/deals`,
    });
  }

  if (porUsuario.size === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: [...porUsuario.keys()] }, status: 'ACTIVE' },
    select: { id: true, tenantId: true, email: true, firstName: true, lastName: true, lastDigestAt: true },
  });

  return users
    // Ya se le mandó hoy. Sin esta guarda, dos corridas del cron el mismo día mandan el mismo
    // correo dos veces, y el segundo enseña a ignorar los dos.
    .filter((user) => incluirYaEnviados || !user.lastDigestAt || !sameUtcDay(user.lastDigestAt, now))
    .map((user) => ({
      userId: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      items: (porUsuario.get(user.id) ?? [])
        // El cron mira todas las empresas de una vez, así que acá se cierra el paso: un id repetido
        // entre empresas metería en el correo de alguien un pendiente de otra empresa.
        .filter((item) => item.tenantId === user.tenantId)
        .sort((a, b) => +a.dueDate - +b.dueDate),
    }))
    .filter((digest) => digest.items.length > 0);
}

export interface RunResult {
  sent: number;
  failed: number;
  skipped: number;
}

export async function runReminders(now = new Date()): Promise<RunResult> {
  const digests = await buildDigests(now);
  const result: RunResult = { sent: 0, failed: 0, skipped: 0 };

  for (const digest of digests) {
    const ok = await sendEmail({ to: digest.email, ...dailyDigestEmail(digest.name, digest.items, now) });
    if (ok) {
      result.sent += 1;
      // Solo se marca si SALIÓ. Marcarlo igual haría que un día con el correo caído se saltee sin
      // que nadie reciba nada.
      await prisma.user.update({ where: { id: digest.userId }, data: { lastDigestAt: now } });
    } else {
      result.failed += 1;
    }
  }
  return result;
}
