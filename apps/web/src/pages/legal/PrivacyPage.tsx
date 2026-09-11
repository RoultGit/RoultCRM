import { LegalLayout, H2, Lista } from './LegalLayout.js';

/**
 * Política de privacidad.
 *
 * El punto que ordena todo lo demás: en un CRM vendido a empresas, los datos personales que se
 * guardan son de los CLIENTES de la empresa que contrata, no nuestros. Esa empresa es la
 * responsable del banco de datos y nosotros somos quienes lo tratamos por encargo suyo. Confundir
 * eso es el error que hace que una política de privacidad no sirva para nada.
 */
export function PrivacyPage() {
  return (
    <LegalLayout titulo="Política de privacidad" actualizado="11 de setiembre de 2026">
      <p>
        RoultCRM es un servicio de ROUlt. Esta política explica qué datos personales se tratan al
        usarlo, quién responde por ellos y cómo se ejercen los derechos que da la{' '}
        <strong>Ley 29733 de Protección de Datos Personales</strong> y su reglamento.
      </p>

      <H2>Quién responde por los datos</H2>
      <p>
        Hay que separar dos cosas que se mezclan siempre:
      </p>
      <Lista
        items={[
          <>
            <strong>Los datos de tus clientes.</strong> Los cargás vos en el sistema. La{' '}
            <strong>empresa que contrata RoultCRM es la responsable</strong> de ese banco de datos:
            decide qué guarda, para qué y por cuánto tiempo, y es quien tiene que haber obtenido el
            consentimiento cuando corresponde. ROUlt los trata <strong>por encargo</strong> suyo y
            solo para prestar el servicio.
          </>,
          <>
            <strong>Los datos de tu cuenta</strong> —nombre, correo, teléfono del equipo, registro de
            actividad—. De esos responde ROUlt, porque son necesarios para darte el servicio.
          </>,
        ]}
      />

      <H2>Qué datos se guardan</H2>
      <Lista
        items={[
          'De tu equipo: nombre, correo, teléfono, rol, y el registro de qué hizo cada quien y cuándo.',
          'De tus clientes y prospectos: lo que vos cargues. Típicamente razón social, nombre de contacto, representante, teléfono, WhatsApp, correo, ciudad y las notas que escriba tu equipo.',
          'De la operación: ventas, montos, cotizaciones, cuotas de cobranza, tareas y el historial de lo que se conversó.',
          'Archivos que subas: contratos, órdenes de compra, fotos.',
          'Si conectás WhatsApp o el buzón de correo: el contenido de esos mensajes con tus clientes.',
          'Datos técnicos mínimos para que el servicio funcione y sea seguro: dirección IP en los registros, y errores del servidor.',
        ]}
      />
      <p>
        <strong>No se guardan</strong> datos de tarjetas ni medios de pago, y las contraseñas se
        guardan cifradas de forma irreversible: nadie de ROUlt puede leerlas.
      </p>

      <H2>Dónde están</H2>
      <p>
        La base de datos y los archivos están alojados en <strong>Supabase</strong>, en centros de
        datos de Estados Unidos (región us-east-1). La aplicación corre en <strong>Vercel</strong>.
        Eso implica una <strong>transferencia internacional</strong> de datos, que la ley admite
        cuando el destino ofrece niveles adecuados de protección y el encargado mantiene las medidas
        de seguridad correspondientes.
      </p>
      <p>Otros terceros, solo si la empresa decide conectarlos:</p>
      <Lista
        items={[
          <><strong>Meta (WhatsApp Business)</strong>, si conectás tu número, para enviar y recibir mensajes.</>,
          <><strong>Resend</strong>, si se activa el correo de salida, para mandar avisos y recuperación de contraseña.</>,
        ]}
      />

      <H2>Para qué se usan</H2>
      <p>
        Solo para prestar el servicio: que puedas gestionar tus clientes y tu equipo. ROUlt{' '}
        <strong>no vende, alquila ni cede</strong> tus datos ni los de tus clientes, y{' '}
        <strong>no los usa para entrenar modelos</strong> ni para publicidad. El personal de ROUlt
        solo accede cuando es imprescindible para dar soporte o resolver una falla, y esos accesos
        quedan registrados.
      </p>

      <H2>Por cuánto tiempo</H2>
      <Lista
        items={[
          'Mientras la empresa tenga el servicio contratado, y hasta 30 días después de darlo de baja, para permitir recuperarlo si fue un error.',
          'Pasado ese plazo, se eliminan a pedido de la empresa o al cancelar definitivamente.',
          'El registro de errores del servidor se borra automáticamente a los 30 días.',
        ]}
      />

      <H2>Tus derechos</H2>
      <p>
        La ley reconoce los derechos de <strong>acceso, rectificación, cancelación y oposición</strong>.
        En la práctica:
      </p>
      <Lista
        items={[
          <>
            <strong>Acceso y portabilidad:</strong> cualquier administrador puede descargar{' '}
            <strong>todos</strong> los datos de su empresa desde la aplicación, en un archivo, sin
            pedirle permiso a nadie.
          </>,
          <><strong>Rectificación:</strong> los datos se editan desde la misma aplicación.</>,
          <><strong>Cancelación:</strong> se eliminan desde la aplicación, o se pide la baja completa de la empresa.</>,
          <>
            Si una persona cuyos datos cargaste en el CRM ejerce alguno de estos derechos, quien debe
            responderle es <strong>tu empresa</strong>, porque es la responsable del banco de datos.
            ROUlt te da las herramientas para hacerlo.
          </>,
        ]}
      />

      <H2>Seguridad</H2>
      <Lista
        items={[
          'Todo viaja cifrado (HTTPS) y la base exige conexión cifrada.',
          'Cada empresa está aislada de las demás: el aislamiento se aplica en el servidor, no en la pantalla.',
          'Las contraseñas se guardan con un hash de un solo sentido, y las credenciales de terceros que conectes se guardan cifradas.',
          'Las sesiones se renuevan con tokens que rotan y se pueden cortar.',
          'Queda registro de quién hizo qué y cuándo.',
        ]}
      />
      <p>
        Ninguna medida es absoluta. Si ocurriera un incidente que afecte datos personales, ROUlt lo
        comunicará a las empresas afectadas sin demora, con lo que se sepa y lo que se esté haciendo.
      </p>

      <H2>Contacto</H2>
      <p>
        Para cualquier consulta sobre esta política o para ejercer tus derechos, escribinos a{' '}
        <strong>hola@roult.pe</strong>. Si considerás que tus derechos no fueron atendidos, podés
        acudir a la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia.
      </p>

      <p className="rounded-lg bg-amber-50 p-4 text-xs text-amber-900">
        <strong>Nota para ROUlt, no para el cliente:</strong> este texto describe con precisión cómo
        funciona el sistema, pero <strong>no reemplaza la revisión de un abogado</strong>. Antes de
        firmar con el primer cliente conviene que un especialista en protección de datos lo revise,
        confirme si corresponde inscribir el banco de datos ante la Autoridad, y complete la razón
        social y el domicilio legal de ROUlt.
      </p>
    </LegalLayout>
  );
}
