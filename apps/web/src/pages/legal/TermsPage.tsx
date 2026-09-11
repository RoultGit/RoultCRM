import { LegalLayout, H2, Lista } from './LegalLayout.js';

export function TermsPage() {
  return (
    <LegalLayout titulo="Términos del servicio" actualizado="11 de setiembre de 2026">
      <p>
        Estos términos regulan el uso de RoultCRM, un servicio de ROUlt. Al crear una cuenta o usar
        el sistema, la empresa contratante los acepta.
      </p>

      <H2>Qué es el servicio</H2>
      <p>
        RoultCRM es un software que se usa desde el navegador para gestionar clientes, ventas,
        cotizaciones, cobranza y tareas. Se contrata por empresa. Cada empresa tiene su propio
        espacio y no comparte datos con ninguna otra.
      </p>

      <H2>Las cuentas</H2>
      <Lista
        items={[
          'Cada persona usa su propia cuenta. Compartir credenciales rompe el registro de quién hizo qué, que es justamente lo que protege a la empresa.',
          'El administrador de la empresa es quien da de alta y de baja a su equipo, y responde por lo que ese equipo haga dentro del sistema.',
          'Las contraseñas son responsabilidad de cada persona. El sistema obliga a cambiar las provisorias al primer ingreso.',
        ]}
      />

      <H2>De quién son los datos</H2>
      <p>
        <strong>Los datos que cargues son tuyos.</strong> ROUlt no adquiere ningún derecho sobre
        ellos: los guarda y los procesa únicamente para prestarte el servicio. Podés descargarlos
        completos, cuando quieras, desde la propia aplicación.
      </p>
      <p>
        Al cargar datos de terceros —tus clientes, sus contactos— declarás que tenés la base legal
        para hacerlo. Cómo se tratan está en la{' '}
        <a href="/privacidad" className="underline">política de privacidad</a>.
      </p>

      <H2>Qué no se puede hacer</H2>
      <Lista
        items={[
          'Usar el servicio para actividades ilegales, ni para enviar comunicaciones no solicitadas en forma masiva.',
          'Intentar acceder a datos de otra empresa, sondear o forzar el sistema.',
          'Revender o dar acceso a terceros ajenos a la empresa contratante sin acuerdo previo.',
          'Cargar contenido que infrinja derechos de terceros.',
        ]}
      />

      <H2>Disponibilidad</H2>
      <p>
        Se hace lo razonable para que el servicio esté disponible, pero <strong>no se garantiza
        funcionamiento ininterrumpido</strong>. Puede haber cortes por mantenimiento, por fallas de
        los proveedores de infraestructura o por causas fuera de control de ROUlt. Cuando el
        mantenimiento sea programado, se avisa con anticipación.
      </p>

      <H2>Respaldos</H2>
      <p>
        La infraestructura realiza copias de seguridad periódicas. Aun así,{' '}
        <strong>la exportación de datos está disponible en la aplicación</strong> y se recomienda
        usarla con regularidad: un respaldo que uno controla es el único que no depende de nadie.
      </p>

      <H2>Baja y eliminación</H2>
      <Lista
        items={[
          'La empresa puede dar de baja el servicio cuando quiera.',
          'Antes de irse conviene descargar los datos, porque después de la eliminación no hay forma de recuperarlos.',
          'Si la empresa incumple estos términos, ROUlt puede suspender el acceso, avisando y dando oportunidad de corregir salvo que la gravedad no lo permita.',
        ]}
      />

      <H2>Responsabilidad</H2>
      <p>
        RoultCRM es una herramienta de gestión: <strong>no sustituye asesoría contable, legal ni
        tributaria</strong>, y los montos, cuotas y reportes que muestra son los que la propia
        empresa cargó. ROUlt no responde por decisiones comerciales tomadas en base a esa
        información, ni por lucro cesante. En cualquier caso, la responsabilidad total de ROUlt está
        limitada a lo efectivamente pagado por el servicio en los últimos doce meses.
      </p>

      <H2>Cambios</H2>
      <p>
        Estos términos pueden cambiar. Si el cambio es relevante, se avisa antes de que entre en
        vigencia. Seguir usando el servicio después implica aceptarlo.
      </p>

      <H2>Ley aplicable</H2>
      <p>
        Se aplica la legislación de la República del Perú, y cualquier controversia se somete a los
        jueces y tribunales de Lima.
      </p>

      <H2>Contacto</H2>
      <p>
        <strong>hola@roult.pe</strong>
      </p>

      <p className="rounded-lg bg-amber-50 p-4 text-xs text-amber-900">
        <strong>Nota para ROUlt, no para el cliente:</strong> falta completar la razón social, el RUC
        y el domicilio legal, y definir el plazo y la forma de pago del servicio. Y esto{' '}
        <strong>tiene que verlo un abogado</strong> antes del primer contrato: un límite de
        responsabilidad mal redactado no protege nada.
      </p>
    </LegalLayout>
  );
}
