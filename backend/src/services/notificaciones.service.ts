import nodemailer from 'nodemailer';
import oracledb from 'oracledb';

// ── Transportador de email ────────────────────────────────────────────────────
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter) return _transporter;

  const host = process.env.EMAIL_HOST;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!host || !user || !pass || pass === 'AQUI_TU_APP_PASSWORD_16_CHARS') return null;

  _transporter = nodemailer.createTransport({
    host,
    port:   Number(process.env.EMAIL_PORT ?? 587),
    secure: process.env.EMAIL_PORT === '465',
    auth:   { user, pass },
    tls:    { rejectUnauthorized: false },   // evita errores de cert en algunos entornos
  });

  return _transporter;
}

/** Wrapper genérico para enviar emails — silencia si el SMTP no está configurado */
export async function sendMail(options: nodemailer.SendMailOptions): Promise<void> {
  const t = getTransporter();
  if (!t) return;
  await t.sendMail(options);
}

/** Verifica la conexión SMTP al arrancar — no bloquea el servidor si falla */
export async function verificarConexionEmail(): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.log('📧 Email: no configurado (EMAIL_USER / EMAIL_PASS vacíos — notificaciones desactivadas)');
    return;
  }
  try {
    await t.verify();
    console.log(`✅ Email SMTP listo: ${process.env.EMAIL_USER}`);
  } catch (err: any) {
    console.error(`❌ Email SMTP falló al verificar: ${err.message}`);
    console.error('   Verifica que EMAIL_PASS sea un App Password de Google (no tu contraseña normal)');
    _transporter = null;  // resetear para intentar de nuevo si se reinicia
  }
}

// ── Info del ticket para notificaciones ───────────────────────────────────────
interface TicketNotifInfo {
  ID_TICKET:              number;
  ID_USUARIO:             number;
  CODIGO_TICKET:          string;
  TITULO:                 string;
  ESTADO:                 string;
  PRIORIDAD:              string;
  NOMBRE_USUARIO:         string;
  EMAIL_USUARIO:          string;
  TELEFONO_USUARIO:       string | null;
  NOTIF_EMAIL_USR:        number;
  NOTIF_WA_USR:           number;
  NOMBRE_TECNICO:         string | null;
  EMAIL_TECNICO:          string | null;
  TELEFONO_TECNICO:       string | null;
  NOTIF_EMAIL_TEC:        number | null;
  NOTIF_WA_TEC:           number | null;
}

async function getTicketInfo(idTicket: number): Promise<TicketNotifInfo | null> {
  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(
      `SELECT
         t.ID_TICKET,
         t.ID_USUARIO,
         t.CODIGO_TICKET,
         t.TITULO,
         t.ESTADO,
         t.PRIORIDAD,
         u.NOMBRE         AS NOMBRE_USUARIO,
         u.EMAIL          AS EMAIL_USUARIO,
         u.TELEFONO       AS TELEFONO_USUARIO,
         u.NOTIF_EMAIL    AS NOTIF_EMAIL_USR,
         u.NOTIF_WHATSAPP AS NOTIF_WA_USR,
         ut.NOMBRE        AS NOMBRE_TECNICO,
         ut.EMAIL         AS EMAIL_TECNICO,
         ut.TELEFONO      AS TELEFONO_TECNICO,
         ut.NOTIF_EMAIL   AS NOTIF_EMAIL_TEC,
         ut.NOTIF_WHATSAPP AS NOTIF_WA_TEC
       FROM HD_TICKETS t
       JOIN HD_USUARIOS u ON t.ID_USUARIO = u.ID_USUARIO
       LEFT JOIN HD_USUARIOS ut ON t.ID_TECNICO = ut.ID_USUARIO
       WHERE t.ID_TICKET = :idTicket`,
      { idTicket },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return (result.rows as any[])?.[0] ?? null;
  } catch (err: any) {
    console.error('Error al obtener info ticket para notificación:', err.message);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

// ── Fecha/hora formateada (Ecuador) ──────────────────────────────────────────
function fechaHoraEcuador(): string {
  return new Date().toLocaleString('es-EC', {
    timeZone: 'America/Guayaquil',
    day:    '2-digit',
    month:  'long',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ── Colores para templates ────────────────────────────────────────────────────
const ESTADO_COLOR: Record<string, string> = {
  ABIERTO:     '#3b82f6',
  EN_PROGRESO: '#f59e0b',
  RESUELTO:    '#10b981',
  CERRADO:     '#64748b',
};
const PRIO_COLOR: Record<string, string> = {
  ALTA:  '#ef4444',
  MEDIA: '#f59e0b',
  BAJA:  '#22c55e',
};

// ── Template HTML de email ────────────────────────────────────────────────────
function buildEmailHtml(params: {
  nombre:         string;
  titulo:         string;
  cuerpo:         string;
  codigo:         string;
  asunto:         string;
  estado:         string;
  prioridad:      string;
  accentColor?:   string;
  extraFila?:     { label: string; value: string };
  btnTexto?:      string;
}) {
  const {
    nombre, titulo, cuerpo, codigo, asunto, estado, prioridad,
    accentColor, extraFila, btnTexto,
  } = params;

  const url    = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/dashboard/tickets`;
  const accent = accentColor ?? '#3b82f6';
  const ec     = ESTADO_COLOR[estado]  ?? '#64748b';
  const pc     = PRIO_COLOR[prioridad] ?? '#64748b';
  const fecha  = fechaHoraEcuador();
  const btn    = btnTexto ?? 'Ver mi ticket →';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <!-- Banda de color por tipo de evento -->
      <tr><td style="background:${accent};height:5px;border-radius:10px 10px 0 0;font-size:0;">&nbsp;</td></tr>

      <!-- Header -->
      <tr><td style="background:#1e293b;padding:18px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <span style="color:#94a3b8;font-family:monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;">SISTEMA HELPDESK</span>
            </td>
            <td align="right">
              <span style="color:#475569;font-size:10px;">${fecha}</span>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Saludo personalizado -->
      <tr><td style="background:#ffffff;padding:28px 28px 0;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
        <p style="color:#94a3b8;font-size:13px;margin:0 0 4px;">Hola,</p>
        <h2 style="color:#1e293b;margin:0 0 6px;font-size:20px;font-weight:700;">${nombre}</h2>
        <div style="width:36px;height:3px;background:${accent};border-radius:999px;margin-bottom:20px;"></div>
        <h3 style="color:#1e293b;margin:0 0 10px;font-size:16px;font-weight:600;">${titulo}</h3>
        <p style="color:#64748b;margin:0 0 22px;font-size:14px;line-height:1.7;">${cuerpo}</p>
      </td></tr>

      <!-- Ticket card -->
      <tr><td style="background:#ffffff;padding:0 28px 24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid ${accent};border-radius:0 8px 8px 0;padding:16px 20px;">
          <table cellpadding="5" cellspacing="0" width="100%">
            <tr>
              <td style="color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;width:100px;">Código</td>
              <td style="color:#1e293b;font-size:13px;font-weight:700;">${codigo}</td>
            </tr>
            <tr>
              <td style="color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Asunto</td>
              <td style="color:#1e293b;font-size:13px;">${asunto}</td>
            </tr>
            <tr>
              <td style="color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Estado</td>
              <td><span style="background:${ec}22;color:${ec};padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;">${estado.replace('_',' ')}</span></td>
            </tr>
            <tr>
              <td style="color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Prioridad</td>
              <td><span style="background:${pc}22;color:${pc};padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;">${prioridad}</span></td>
            </tr>
            ${extraFila ? `<tr>
              <td style="color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">${extraFila.label}</td>
              <td style="color:#1e293b;font-size:13px;font-weight:600;">${extraFila.value}</td>
            </tr>` : ''}
            <tr>
              <td style="color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding-top:8px;border-top:1px solid #e2e8f0;">Fecha</td>
              <td style="color:#64748b;font-size:12px;padding-top:8px;border-top:1px solid #e2e8f0;">${fecha}</td>
            </tr>
          </table>
        </div>
      </td></tr>

      <!-- Botón de acción -->
      <tr><td style="background:#ffffff;padding:0 28px 28px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
        <a href="${url}" style="display:inline-block;background:${accent};color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.2px;">
          ${btn}
        </a>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f8fafc;padding:14px 28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;">
        <p style="color:#94a3b8;font-size:11px;margin:0;line-height:1.6;">
          Notificación automática del Sistema Helpdesk &mdash; No respondas a este correo.<br>
          Si no esperabas este mensaje, puedes ignorarlo con seguridad.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Enviar email ──────────────────────────────────────────────────────────────
async function enviarEmail(to: string, subject: string, html: string): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from:    process.env.EMAIL_FROM ?? process.env.EMAIL_USER,
      to,
      subject: `[Helpdesk] ${subject}`,
      html,
    });
    console.log(`📧 Email enviado a ${to}: ${subject}`);
  } catch (err: any) {
    console.error(`❌ Error email a ${to}:`, err.message);
  }
}

// ── Notificar a una persona por email ────────────────────────────────────────
async function notificar(params: {
  email:      string;
  notifEmail: number | null;
  subject:    string;
  html:       string;
  forzar?:    boolean;  // true = ignorar preferencia del usuario y siempre enviar
  telefono?:      string | null;
  notifWhatsapp?: number | null;
  waText?:        string;
}): Promise<void> {
  if (params.forzar || (params.notifEmail ?? 1) !== 0) {
    await enviarEmail(params.email, params.subject, params.html);
  }
}

// ═══════════════════════════════════════════════════════════════
// EVENTOS PÚBLICOS
// ═══════════════════════════════════════════════════════════════

/** Obtiene todos los ADMIN y TECNICO activos para notificaciones broadcast */
async function getStaffList(): Promise<Array<{
  nombre: string; email: string; telefono: string | null; notif_email: number; notif_wa: number;
}>> {
  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(
      `SELECT NOMBRE, EMAIL, TELEFONO, NOTIF_EMAIL, NOTIF_WHATSAPP
       FROM HD_USUARIOS
       WHERE ROL IN ('ADMIN','TECNICO') AND ESTADO = 'ACTIVO'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return (result.rows as any[]).map(r => ({
      nombre:      r.NOMBRE,
      email:       r.EMAIL,
      telefono:    r.TELEFONO   ?? null,
      notif_email: r.NOTIF_EMAIL ?? 1,
      notif_wa:    r.NOTIF_WHATSAPP ?? 0,
    }));
  } catch { return []; }
  finally { if (connection) await connection.close(); }
}

/** Ticket recién creado → confirmar al solicitante, alertar al staff */
export async function notificarTicketCreado(idTicket: number): Promise<void> {
  const t = await getTicketInfo(idTicket);
  if (!t) return;

  // ── 1. Al solicitante: confirmación de recepción ──
  await notificar({
    email:         t.EMAIL_USUARIO,
    telefono:      t.TELEFONO_USUARIO,
    notifEmail:    t.NOTIF_EMAIL_USR,
    notifWhatsapp: t.NOTIF_WA_USR,
    subject:       `Ticket registrado: ${t.CODIGO_TICKET}`,
    html: buildEmailHtml({
      nombre:      t.NOMBRE_USUARIO,
      titulo:      '✅ Tu ticket fue registrado exitosamente',
      cuerpo:      `Tu solicitud de soporte fue recibida y está en cola de atención. En breve un técnico de nuestro equipo se pondrá en contacto contigo. Te notificaremos por este medio cada vez que haya un cambio en tu ticket.`,
      codigo:      t.CODIGO_TICKET,
      asunto:      t.TITULO,
      estado:      t.ESTADO,
      prioridad:   t.PRIORIDAD,
      accentColor: '#3b82f6',
      btnTexto:    'Ver mi ticket →',
    }),
    waText: `🎫 *Ticket Registrado — Helpdesk*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Hola *${t.NOMBRE_USUARIO}*, hemos recibido tu solicitud de soporte.\n\n` +
            `📋 *Código:* ${t.CODIGO_TICKET}\n` +
            `📌 *Asunto:* ${t.TITULO}\n` +
            `⚡ *Prioridad:* ${t.PRIORIDAD}\n` +
            `📅 *Fecha:* ${fechaHoraEcuador()}\n\n` +
            `Tu ticket está en cola y será atendido a la brevedad. Te notificaremos cada vez que haya un cambio.\n\n` +
            `_Sistema Helpdesk — Soporte Técnico_`,
  });

  // ── 2. Notificar al staff (técnico asignado o todos si no hay asignado) ──
  if (t.EMAIL_TECNICO && t.NOMBRE_TECNICO) {
    // Hay técnico asignado → notificar solo a él
    await notificar({
      email:         t.EMAIL_TECNICO,
      telefono:      t.TELEFONO_TECNICO,
      notifEmail:    t.NOTIF_EMAIL_TEC,
      notifWhatsapp: t.NOTIF_WA_TEC,
      subject:       `Nuevo ticket asignado: ${t.CODIGO_TICKET}`,
      html: buildEmailHtml({
        nombre:      t.NOMBRE_TECNICO!,
        titulo:      '🔔 Tienes un nuevo ticket asignado',
        cuerpo:      `Se te asignó el ticket de <strong>${t.NOMBRE_USUARIO}</strong>. Por favor revísalo e inicia la atención a la brevedad posible.`,
        codigo:      t.CODIGO_TICKET,
        asunto:      t.TITULO,
        estado:      t.ESTADO,
        prioridad:   t.PRIORIDAD,
        accentColor: '#3b82f6',
        extraFila:   { label: 'Solicitante', value: t.NOMBRE_USUARIO },
        btnTexto:    'Atender ticket →',
      }),
      waText: `🔔 *Nuevo Ticket Asignado — Helpdesk*\n` +
              `━━━━━━━━━━━━━━━━━━━━━━\n` +
              `Hola *${t.NOMBRE_TECNICO}*, tienes un nuevo ticket asignado.\n\n` +
              `👤 *Solicitante:* ${t.NOMBRE_USUARIO}\n` +
              `📋 *Código:* ${t.CODIGO_TICKET}\n` +
              `📌 *Asunto:* ${t.TITULO}\n` +
              `⚡ *Prioridad:* ${t.PRIORIDAD}\n` +
              `📅 *Registrado:* ${fechaHoraEcuador()}\n\n` +
              `Por favor atiéndelo a la brevedad posible.\n\n` +
              `_Sistema Helpdesk — Soporte Técnico_`,
    });
  } else {
    // Sin técnico asignado → notificar a TODO el staff (admins + técnicos)
    const staff = await getStaffList();
    await Promise.allSettled(staff.map(s =>
      notificar({
        email:         s.email,
        telefono:      s.telefono,
        notifEmail:    s.notif_email,
        notifWhatsapp: s.notif_wa,
        subject:       `Nuevo ticket sin asignar: ${t.CODIGO_TICKET} — Prioridad ${t.PRIORIDAD}`,
        html: buildEmailHtml({
          nombre:      s.nombre,
          titulo:      '🆕 Nuevo ticket sin técnico asignado',
          cuerpo:      `El usuario <strong>${t.NOMBRE_USUARIO}</strong> abrió un nuevo ticket que aún no tiene técnico asignado. Por favor ingresa al sistema y asígnalo cuanto antes.`,
          codigo:      t.CODIGO_TICKET,
          asunto:      t.TITULO,
          estado:      t.ESTADO,
          prioridad:   t.PRIORIDAD,
          accentColor: '#3b82f6',
          extraFila:   { label: 'Solicitante', value: t.NOMBRE_USUARIO },
          btnTexto:    'Asignar ticket →',
        }),
        waText: `🆕 *Ticket Sin Asignar — Helpdesk*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Se registró un nuevo ticket sin técnico asignado.\n\n` +
                `👤 *Solicitante:* ${t.NOMBRE_USUARIO}\n` +
                `📋 *Código:* ${t.CODIGO_TICKET}\n` +
                `📌 *Asunto:* ${t.TITULO}\n` +
                `⚡ *Prioridad:* ${t.PRIORIDAD}\n` +
                `📅 *Registrado:* ${fechaHoraEcuador()}\n\n` +
                `Ingresa al sistema y asígnalo lo antes posible.\n\n` +
                `_Sistema Helpdesk — Soporte Técnico_`,
      })
    ));
  }
}

/** Cambio de estado → notificar al solicitante (y al técnico si aplica) */
export async function notificarCambioEstado(
  idTicket: number,
  estadoAnterior: string,
  estadoNuevo: string
): Promise<void> {
  const t = await getTicketInfo(idTicket);
  if (!t) return;

  const ESTADO_ICON: Record<string, string> = {
    EN_PROGRESO: '🔧',
    RESUELTO:    '✅',
    CERRADO:     '🔒',
    REABIERTO:   '🔄',
    ABIERTO:     '📋',
  };

  const mensajeExtra: Record<string, string> = {
    EN_PROGRESO: 'Un técnico de soporte ya está trabajando en tu solicitud. Te avisaremos cuando esté resuelto.',
    RESUELTO:    'Hemos completado la atención de tu solicitud. Si el problema persiste, puedes reabrirlo desde el sistema.',
    CERRADO:     'El ticket fue cerrado definitivamente. Si necesitas soporte adicional, abre un nuevo ticket en el sistema.',
    REABIERTO:   'Tu ticket fue reabierto y está nuevamente en cola de atención. Te notificaremos los avances.',
  };

  const tituloWa: Record<string, string> = {
    EN_PROGRESO: '🔧 Tu Ticket Está en Progreso — Helpdesk',
    RESUELTO:    '✅ Tu Problema Ha Sido Resuelto — Helpdesk',
    CERRADO:     '🔒 Ticket Cerrado — Helpdesk',
    REABIERTO:   '🔄 Ticket Reabierto — Helpdesk',
  };

  const labelFecha: Record<string, string> = {
    EN_PROGRESO: 'En progreso desde:',
    RESUELTO:    'Resuelto el:',
    CERRADO:     'Cerrado el:',
    REABIERTO:   'Reabierto el:',
  };

  const icon = ESTADO_ICON[estadoNuevo] ?? '🔔';

  // Notificar al solicitante — forzar envío para estados finales críticos
  const esFinal = ['RESUELTO', 'CERRADO'].includes(estadoNuevo);
  await notificar({
    email:         t.EMAIL_USUARIO,
    telefono:      t.TELEFONO_USUARIO,
    notifEmail:    t.NOTIF_EMAIL_USR,
    notifWhatsapp: t.NOTIF_WA_USR,
    forzar:        esFinal,
    subject:       `${icon} Tu ticket ${t.CODIGO_TICKET} — Estado: ${estadoNuevo}`,
    html: buildEmailHtml({
      nombre:      t.NOMBRE_USUARIO,
      titulo:      tituloWa[estadoNuevo]?.replace(' — Helpdesk', '') ?? `${icon} Estado actualizado`,
      cuerpo:      `El estado de tu ticket ha cambiado de <strong>${estadoAnterior.replace('_',' ')}</strong> a <strong>${estadoNuevo.replace('_',' ')}</strong>.<br><br>${mensajeExtra[estadoNuevo] ?? ''}`,
      codigo:      t.CODIGO_TICKET,
      asunto:      t.TITULO,
      estado:      estadoNuevo,
      prioridad:   t.PRIORIDAD,
      accentColor: { EN_PROGRESO: '#f59e0b', RESUELTO: '#10b981', CERRADO: '#64748b', REABIERTO: '#8b5cf6' }[estadoNuevo] ?? '#3b82f6',
      extraFila:   { label: labelFecha[estadoNuevo] ?? 'Actualizado', value: fechaHoraEcuador() },
      btnTexto:    estadoNuevo === 'RESUELTO' ? 'Ver resolución →' : estadoNuevo === 'CERRADO' ? 'Ver ticket cerrado →' : 'Ver mi ticket →',
    }),
    waText: `${tituloWa[estadoNuevo] ?? `${icon} Estado Actualizado — Helpdesk`}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Hola *${t.NOMBRE_USUARIO}*,\n\n` +
            `📋 *Código:* ${t.CODIGO_TICKET}\n` +
            `📌 *Asunto:* ${t.TITULO}\n` +
            `🔄 *Estado:* ${estadoAnterior} ➡️ *${estadoNuevo}*\n` +
            `📅 *${labelFecha[estadoNuevo] ?? 'Actualizado:'}* ${fechaHoraEcuador()}\n\n` +
            `${mensajeExtra[estadoNuevo] ?? ''}\n\n` +
            `_Sistema Helpdesk — Soporte Técnico_`,
  });

  // Si fue REABIERTO → notificar también al técnico asignado
  if (estadoNuevo === 'REABIERTO' && t.EMAIL_TECNICO && t.NOMBRE_TECNICO) {
    await notificar({
      email:         t.EMAIL_TECNICO,
      telefono:      t.TELEFONO_TECNICO,
      notifEmail:    t.NOTIF_EMAIL_TEC,
      notifWhatsapp: t.NOTIF_WA_TEC,
      subject:       `🔄 Ticket reabierto: ${t.CODIGO_TICKET}`,
      html: buildEmailHtml({
        nombre:      t.NOMBRE_TECNICO!,
        titulo:      '🔄 El usuario reabrió el ticket',
        cuerpo:      `<strong>${t.NOMBRE_USUARIO}</strong> reportó que el problema no fue resuelto completamente y reabrió el ticket. Por favor revisa el historial y continúa la atención.`,
        codigo:      t.CODIGO_TICKET,
        asunto:      t.TITULO,
        estado:      estadoNuevo,
        prioridad:   t.PRIORIDAD,
        accentColor: '#8b5cf6',
        extraFila:   { label: 'Solicitante', value: t.NOMBRE_USUARIO },
        btnTexto:    'Revisar ticket →',
      }),
      waText: `🔄 *Ticket Reabierto — Helpdesk*\n` +
              `━━━━━━━━━━━━━━━━━━━━━━\n` +
              `Hola *${t.NOMBRE_TECNICO}*,\n\n` +
              `El usuario *${t.NOMBRE_USUARIO}* reporta que el problema no fue resuelto completamente.\n\n` +
              `📋 *Código:* ${t.CODIGO_TICKET}\n` +
              `📌 *Asunto:* ${t.TITULO}\n` +
              `📅 *Reabierto el:* ${fechaHoraEcuador()}\n\n` +
              `Ingresa al sistema para revisar y resolver la solicitud.\n\n` +
              `_Sistema Helpdesk — Soporte Técnico_`,
    });
  }
}

/** Nuevo comentario → notificar a la "otra parte" */
export async function notificarComentario(
  idTicket: number,
  idComentador: number
): Promise<void> {
  const t = await getTicketInfo(idTicket);
  if (!t) return;

  // Si comentó el dueño del ticket → avisar al técnico; si comentó el técnico → avisar al solicitante
  const comentoElDueno = idComentador === t.ID_USUARIO;

  if (comentoElDueno && t.EMAIL_TECNICO && t.NOMBRE_TECNICO) {
    await notificar({
      email:         t.EMAIL_TECNICO,
      telefono:      t.TELEFONO_TECNICO,
      notifEmail:    t.NOTIF_EMAIL_TEC,
      notifWhatsapp: t.NOTIF_WA_TEC,
      subject:       `Nueva respuesta en ticket: ${t.CODIGO_TICKET}`,
      html: buildEmailHtml({
        nombre:      t.NOMBRE_TECNICO!,
        titulo:      '💬 Nueva respuesta del usuario',
        cuerpo:      `<strong>${t.NOMBRE_USUARIO}</strong> escribió una nueva respuesta en el ticket. Ingresa al sistema para leer su mensaje y dar el seguimiento correspondiente.`,
        codigo:      t.CODIGO_TICKET,
        asunto:      t.TITULO,
        estado:      t.ESTADO,
        prioridad:   t.PRIORIDAD,
        accentColor: '#8b5cf6',
        extraFila:   { label: 'De', value: t.NOMBRE_USUARIO },
        btnTexto:    'Ver respuesta →',
      }),
      waText: `💬 *Nueva Respuesta de Usuario — Helpdesk*\n` +
              `━━━━━━━━━━━━━━━━━━━━━━\n` +
              `Hola *${t.NOMBRE_TECNICO}*,\n\n` +
              `El usuario *${t.NOMBRE_USUARIO}* respondió en el ticket.\n\n` +
              `📋 *Código:* ${t.CODIGO_TICKET}\n` +
              `📌 *Asunto:* ${t.TITULO}\n` +
              `📅 *Enviado:* ${fechaHoraEcuador()}\n\n` +
              `Ingresa al sistema para ver el mensaje y continuar la atención.\n\n` +
              `_Sistema Helpdesk — Soporte Técnico_`,
    });
  } else if (!comentoElDueno) {
    // Comentó el técnico → avisar al solicitante
    await notificar({
      email:         t.EMAIL_USUARIO,
      telefono:      t.TELEFONO_USUARIO,
      notifEmail:    t.NOTIF_EMAIL_USR,
      notifWhatsapp: t.NOTIF_WA_USR,
      subject:       `Respuesta en tu ticket: ${t.CODIGO_TICKET}`,
      html: buildEmailHtml({
        nombre:      t.NOMBRE_USUARIO,
        titulo:      '💬 El soporte técnico te respondió',
        cuerpo:      `Tienes una nueva respuesta de nuestro equipo de soporte técnico en tu ticket. Ingresa al sistema para leer el mensaje y responder si es necesario.`,
        codigo:      t.CODIGO_TICKET,
        asunto:      t.TITULO,
        estado:      t.ESTADO,
        prioridad:   t.PRIORIDAD,
        accentColor: '#8b5cf6',
        btnTexto:    'Leer respuesta →',
      }),
      waText: `💬 *Soporte Técnico Te Respondió — Helpdesk*\n` +
              `━━━━━━━━━━━━━━━━━━━━━━\n` +
              `Hola *${t.NOMBRE_USUARIO}*,\n\n` +
              `El equipo de soporte respondió en tu ticket.\n\n` +
              `📋 *Código:* ${t.CODIGO_TICKET}\n` +
              `📌 *Asunto:* ${t.TITULO}\n` +
              `📅 *Enviado:* ${fechaHoraEcuador()}\n\n` +
              `Ingresa al sistema para leer la respuesta.\n\n` +
              `_Sistema Helpdesk — Soporte Técnico_`,
    });
  }
}

/** Bienvenida al crear un usuario → envía credenciales por email */
export async function notificarBienvenida(params: {
  nombre:        string;
  email:         string;
  passwordPlano: string;
  rol:           string;
  notifEmail:    number;
}): Promise<void> {
  const { nombre, email, passwordPlano, rol, notifEmail } = params;
  const url = process.env.FRONTEND_URL ?? 'http://localhost:3000';

  const rolLabel: Record<string, string> = {
    ADMIN:   'Administrador',
    TECNICO: 'Técnico de Soporte',
    USUARIO: 'Usuario',
    PASANTE: 'Pasante',
  };

  const esPasante = rol === 'PASANTE';

  const htmlEmail = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td style="background:#1e293b;padding:20px 28px;border-radius:10px 10px 0 0;">
        <span style="color:#60a5fa;font-family:monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;">SISTEMA HELPDESK</span>
      </td></tr>

      <tr><td style="background:#ffffff;padding:28px 28px 24px;border:1px solid #e2e8f0;border-top:none;">
        <h2 style="color:#1e293b;margin:0 0 12px;font-size:18px;">¡Bienvenido, ${nombre}! 👋</h2>
        <p style="color:#64748b;margin:0 0 22px;font-size:14px;line-height:1.65;">
          Tu cuenta en el <strong>Sistema Helpdesk</strong> ha sido creada como
          <strong style="color:#3b82f6;">${rolLabel[rol] ?? rol}</strong>.
          ${esPasante ? 'Tu acceso está <strong>pendiente de aprobación</strong> por el administrador.' : 'Ya puedes iniciar sesión con las credenciales a continuación.'}
        </p>

        <!-- Credenciales -->
        <div style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
          <p style="color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 14px;">Tus credenciales de acceso</p>
          <table cellpadding="6" cellspacing="0" width="100%">
            <tr>
              <td style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;width:100px;">Correo</td>
              <td style="color:#e2e8f0;font-size:14px;font-family:monospace;">${email}</td>
            </tr>
            <tr>
              <td style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;">Contraseña</td>
              <td style="color:#34d399;font-size:14px;font-family:monospace;font-weight:700;">${passwordPlano}</td>
            </tr>
            <tr>
              <td style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;">Rol</td>
              <td style="color:#a78bfa;font-size:13px;">${rolLabel[rol] ?? rol}</td>
            </tr>
          </table>
        </div>

        <div style="background:#fef9c3;border:1px solid #fde047;border-radius:6px;padding:10px 14px;margin-bottom:24px;">
          <p style="color:#854d0e;font-size:12px;margin:0;">
            ⚠️ <strong>Por seguridad</strong>, cambia tu contraseña al ingresar por primera vez desde el menú lateral → "Cambiar contraseña".
          </p>
        </div>

        ${!esPasante ? `<a href="${url}/login" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
          Ingresar al sistema →
        </a>` : `<p style="color:#94a3b8;font-size:13px;">Recibirás un aviso cuando el administrador apruebe tu cuenta.</p>`}
      </td></tr>

      <tr><td style="background:#f8fafc;padding:14px 28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;">
        <p style="color:#94a3b8;font-size:11px;margin:0;">
          Notificación automática del Sistema Helpdesk — No respondas a este correo.
          Si no esperabas este mensaje, ignóralo.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  if (notifEmail !== 0) await enviarEmail(email, 'Bienvenido — Tus credenciales de acceso', htmlEmail);
}

/** Alerta de SLA vencido → avisar al técnico asignado (o admin si no hay técnico) */
export async function notificarSLAVencido(idTicket: number): Promise<void> {
  const t = await getTicketInfo(idTicket);
  if (!t) return;

  // Si hay técnico asignado → notificarle a él; si no, notificar al solicitante
  const destino = t.EMAIL_TECNICO && t.NOMBRE_TECNICO
    ? {
        email:         t.EMAIL_TECNICO,
        telefono:      t.TELEFONO_TECNICO,
        notifEmail:    t.NOTIF_EMAIL_TEC,
        notifWhatsapp: t.NOTIF_WA_TEC,
        nombre:        t.NOMBRE_TECNICO,
      }
    : {
        email:         t.EMAIL_USUARIO,
        telefono:      t.TELEFONO_USUARIO,
        notifEmail:    t.NOTIF_EMAIL_USR,
        notifWhatsapp: t.NOTIF_WA_USR,
        nombre:        t.NOMBRE_USUARIO,
      };

  await notificar({
    email:         destino.email,
    telefono:      destino.telefono,
    notifEmail:    destino.notifEmail,
    notifWhatsapp: destino.notifWhatsapp,
    subject:       `⚠️ SLA vencido — ${t.CODIGO_TICKET} requiere atención inmediata`,
    html: buildEmailHtml({
      nombre:      destino.nombre,
      titulo:      '🚨 SLA Vencido — Atención inmediata requerida',
      cuerpo:      `El ticket <strong>${t.CODIGO_TICKET}</strong> ha superado su tiempo de respuesta establecido (SLA). Es necesario resolverlo de forma <strong style="color:#ef4444;">inmediata</strong> para cumplir con los acuerdos de nivel de servicio.`,
      codigo:      t.CODIGO_TICKET,
      asunto:      t.TITULO,
      estado:      t.ESTADO,
      prioridad:   t.PRIORIDAD,
      accentColor: '#ef4444',
      extraFila:   { label: 'SLA vencido', value: fechaHoraEcuador() },
      btnTexto:    'Atender ahora →',
    }),
    waText: `🚨 *¡ALERTA! SLA Vencido — Helpdesk*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Hola *${destino.nombre}*,\n\n` +
            `El siguiente ticket ha superado su tiempo de respuesta (SLA).\n\n` +
            `📋 *Código:* ${t.CODIGO_TICKET}\n` +
            `📌 *Asunto:* ${t.TITULO}\n` +
            `⚡ *Prioridad:* ${t.PRIORIDAD}\n` +
            `⏰ *Vencido el:* ${fechaHoraEcuador()}\n\n` +
            `⚠️ Se requiere atención *INMEDIATA*. Ingresa al sistema para resolver el ticket.\n\n` +
            `_Sistema Helpdesk — Soporte Técnico_`,
  });
}

/** Asignación de técnico → avisar al técnico */
export async function notificarAsignacion(
  idTicket: number,
  _idTecnico: number
): Promise<void> {
  const t = await getTicketInfo(idTicket);
  if (!t || !t.EMAIL_TECNICO || !t.NOMBRE_TECNICO) return;

  await notificar({
    email:         t.EMAIL_TECNICO,
    telefono:      t.TELEFONO_TECNICO,
    notifEmail:    t.NOTIF_EMAIL_TEC,
    notifWhatsapp: t.NOTIF_WA_TEC,
    subject:       `Se te asignó el ticket: ${t.CODIGO_TICKET}`,
    html: buildEmailHtml({
      nombre:      t.NOMBRE_TECNICO!,
      titulo:      '📋 Se te asignó un ticket de soporte',
      cuerpo:      `El administrador te asignó el ticket de <strong>${t.NOMBRE_USUARIO}</strong>. Por favor revísalo e inicia la atención cuanto antes.`,
      codigo:      t.CODIGO_TICKET,
      asunto:      t.TITULO,
      estado:      t.ESTADO,
      prioridad:   t.PRIORIDAD,
      accentColor: '#3b82f6',
      extraFila:   { label: 'Solicitante', value: t.NOMBRE_USUARIO },
      btnTexto:    'Iniciar atención →',
    }),
    waText: `📋 *Ticket Asignado a Ti — Helpdesk*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Hola *${t.NOMBRE_TECNICO}*, se te ha asignado un nuevo ticket para atender.\n\n` +
            `👤 *Solicitante:* ${t.NOMBRE_USUARIO}\n` +
            `📋 *Código:* ${t.CODIGO_TICKET}\n` +
            `📌 *Asunto:* ${t.TITULO}\n` +
            `⚡ *Prioridad:* ${t.PRIORIDAD}\n` +
            `📅 *Asignado:* ${fechaHoraEcuador()}\n\n` +
            `Ingresa al sistema para iniciar la atención.\n\n` +
            `_Sistema Helpdesk — Soporte Técnico_`,
  });
}

/** Email de prueba — verifica que la configuración SMTP funcione */
export async function enviarEmailPrueba(destinatario: string): Promise<void> {
  const t = getTransporter();
  if (!t) throw new Error('Email no configurado. Revisa EMAIL_USER y EMAIL_PASS en el archivo .env');

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
      <tr><td style="background:#1e293b;padding:20px 28px;border-radius:10px 10px 0 0;">
        <span style="color:#60a5fa;font-family:monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;">SISTEMA HELPDESK</span>
      </td></tr>
      <tr><td style="background:#ffffff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;">
        <h2 style="color:#1e293b;margin:0 0 12px;font-size:18px;">✅ Conexión de email verificada</h2>
        <p style="color:#64748b;margin:0 0 20px;font-size:14px;line-height:1.65;">
          Las notificaciones de email del Sistema Helpdesk están funcionando correctamente.
          Este es un mensaje de prueba enviado desde el panel de administración.
        </p>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 16px;">
          <p style="color:#166534;font-size:13px;margin:0;">
            🎉 Todo listo. Los usuarios recibirán notificaciones cuando se creen o actualicen tickets.
          </p>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  await t.sendMail({
    from:    process.env.EMAIL_FROM ?? process.env.EMAIL_USER,
    to:      destinatario,
    subject: '[Helpdesk] Prueba de configuración de email — Todo funcionando ✅',
    html,
  });
  console.log(`📧 Email de prueba enviado a ${destinatario}`);
}
