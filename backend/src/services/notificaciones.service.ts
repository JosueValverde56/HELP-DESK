import nodemailer from 'nodemailer';
import oracledb from 'oracledb';

// ── Twilio ────────────────────────────────────────────────────────────────────
let twilioClient: any = null;

async function initTwilio(): Promise<boolean> {
  if (twilioClient) return true;
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid === 'AQUI_TU_ACCOUNT_SID') return false;
  try {
    const twilio = await import('twilio');
    twilioClient = twilio.default(sid, token);
    return true;
  } catch {
    return false;
  }
}

/** Verifica credenciales Twilio al arrancar */
export async function verificarConexionWhatsApp(): Promise<void> {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_WHATSAPP_FROM;

  if (!sid || !token || sid === 'AQUI_TU_ACCOUNT_SID') {
    console.log('💬 WhatsApp: no configurado (TWILIO_ACCOUNT_SID vacío — notificaciones desactivadas)');
    return;
  }
  const ok = await initTwilio();
  if (!ok) {
    console.error('❌ WhatsApp: falló al inicializar Twilio. Verifica las credenciales.');
    return;
  }
  // Verificación real: listar cuenta
  try {
    await twilioClient.api.accounts(sid).fetch();
    console.log(`✅ WhatsApp Twilio listo: ${from ?? 'sandbox'}`);
  } catch (err: any) {
    console.error(`❌ WhatsApp Twilio falló: ${err.message}`);
    twilioClient = null;
  }
}

/** WhatsApp de prueba — envía a un número específico */
export async function enviarWhatsAppPrueba(telefono: string): Promise<void> {
  const ok = await initTwilio();
  if (!ok) throw new Error('WhatsApp no configurado. Revisa TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN en .env');

  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) throw new Error('Falta TWILIO_WHATSAPP_FROM en .env');

  const to = telefono.startsWith('whatsapp:') ? telefono : `whatsapp:${telefono}`;
  await twilioClient.messages.create({
    from,
    to,
    body: '✅ *Helpdesk — Prueba de conexión*\n\nLas notificaciones por WhatsApp están funcionando correctamente. Este es un mensaje de prueba enviado desde el panel de administración.',
  });
  console.log(`💬 WhatsApp de prueba enviado a ${telefono}`);
}

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
  titulo:    string;
  cuerpo:    string;
  codigo:    string;
  asunto:    string;
  estado:    string;
  prioridad: string;
}) {
  const { titulo, cuerpo, codigo, asunto, estado, prioridad } = params;
  const url = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/dashboard/tickets`;
  const ec  = ESTADO_COLOR[estado]   ?? '#64748b';
  const pc  = PRIO_COLOR[prioridad]  ?? '#64748b';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <!-- Header -->
      <tr><td style="background:#1e293b;padding:20px 28px;border-radius:10px 10px 0 0;">
        <span style="color:#60a5fa;font-family:monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;">SISTEMA HELPDESK</span>
      </td></tr>

      <!-- Cuerpo -->
      <tr><td style="background:#ffffff;padding:28px 28px 20px;border:1px solid #e2e8f0;border-top:none;">
        <h2 style="color:#1e293b;margin:0 0 12px;font-size:17px;">${titulo}</h2>
        <p style="color:#64748b;margin:0 0 22px;font-size:14px;line-height:1.65;">${cuerpo}</p>

        <!-- Ticket card -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #3b82f6;border-radius:0 6px 6px 0;padding:14px 18px;margin-bottom:24px;">
          <table cellpadding="4" cellspacing="0" width="100%">
            <tr>
              <td style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;width:90px;">Ticket</td>
              <td style="color:#1e293b;font-size:13px;font-weight:700;">${codigo}</td>
            </tr>
            <tr>
              <td style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Asunto</td>
              <td style="color:#1e293b;font-size:13px;">${asunto}</td>
            </tr>
            <tr>
              <td style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Estado</td>
              <td><span style="background:${ec}22;color:${ec};padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;">${estado}</span></td>
            </tr>
            <tr>
              <td style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Prioridad</td>
              <td><span style="background:${pc}22;color:${pc};padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;">${prioridad}</span></td>
            </tr>
          </table>
        </div>

        <a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:11px 24px;border-radius:7px;text-decoration:none;font-size:13px;font-weight:500;">
          Ver ticket en el sistema →
        </a>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f8fafc;padding:14px 28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;">
        <p style="color:#94a3b8;font-size:11px;margin:0;">
          Notificación automática del Sistema Helpdesk — No respondas a este correo.
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

// ── Enviar WhatsApp (Twilio) ───────────────────────────────────────────────────
async function enviarWhatsApp(phone: string, mensaje: string): Promise<void> {
  await initTwilio();
  if (!twilioClient) return;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) return;

  // El teléfono debe tener código de país: +593999123456
  const to = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;
  try {
    await twilioClient.messages.create({ from, to, body: mensaje });
    console.log(`💬 WhatsApp enviado a ${phone}`);
  } catch (err: any) {
    console.error(`❌ Error WhatsApp a ${phone}:`, err.message);
  }
}

// ── Notificar a una persona (email + WhatsApp si aplica) ─────────────────────
async function notificar(params: {
  email:          string;
  telefono:       string | null;
  notifEmail:     number | null;
  notifWhatsapp:  number | null;
  subject:        string;
  html:           string;
  waText:         string;
}): Promise<void> {
  const promises: Promise<void>[] = [];
  // null means preference not set → default on; only skip if explicitly 0
  if ((params.notifEmail  ?? 1) !== 0) promises.push(enviarEmail(params.email, params.subject, params.html));
  if (params.notifWhatsapp === 1 && params.telefono) promises.push(enviarWhatsApp(params.telefono, params.waText));
  await Promise.allSettled(promises);
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
      titulo:    '✅ Tu ticket fue registrado',
      cuerpo:    `Hola <strong>${t.NOMBRE_USUARIO}</strong>, tu solicitud fue recibida y está siendo revisada por el equipo de soporte. En breve un técnico se pondrá en contacto contigo.`,
      codigo:    t.CODIGO_TICKET,
      asunto:    t.TITULO,
      estado:    t.ESTADO,
      prioridad: t.PRIORIDAD,
    }),
    waText: `✅ *Helpdesk — Ticket registrado*\n\n` +
            `Hola ${t.NOMBRE_USUARIO}, tu ticket fue registrado correctamente.\n\n` +
            `📋 *${t.CODIGO_TICKET}*\n` +
            `📌 ${t.TITULO}\n` +
            `🔵 Estado: ${t.ESTADO} | Prioridad: ${t.PRIORIDAD}\n\n` +
            `Ingresa al sistema para dar seguimiento.`,
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
        titulo:    '🔔 Tienes un nuevo ticket asignado',
        cuerpo:    `Hola <strong>${t.NOMBRE_TECNICO}</strong>, se te asignó el siguiente ticket de <strong>${t.NOMBRE_USUARIO}</strong>. Por favor atiéndelo a la brevedad posible.`,
        codigo:    t.CODIGO_TICKET,
        asunto:    t.TITULO,
        estado:    t.ESTADO,
        prioridad: t.PRIORIDAD,
      }),
      waText: `🔔 *Helpdesk — Nuevo ticket asignado*\n\n` +
              `Hola ${t.NOMBRE_TECNICO}, tienes un nuevo ticket de *${t.NOMBRE_USUARIO}*:\n\n` +
              `📋 *${t.CODIGO_TICKET}*\n📌 ${t.TITULO}\n⚡ Prioridad: ${t.PRIORIDAD}\n\n` +
              `Ingresa al sistema para atenderlo.`,
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
          titulo:    '🆕 Nuevo ticket pendiente de atención',
          cuerpo:    `El usuario <strong>${t.NOMBRE_USUARIO}</strong> abrió un nuevo ticket. Aún no tiene técnico asignado — ¡asígnalo a la brevedad!`,
          codigo:    t.CODIGO_TICKET,
          asunto:    t.TITULO,
          estado:    t.ESTADO,
          prioridad: t.PRIORIDAD,
        }),
        waText: `🆕 *Helpdesk — Nuevo ticket sin asignar*\n\n` +
                `*${t.NOMBRE_USUARIO}* abrió un ticket sin técnico asignado:\n\n` +
                `📋 *${t.CODIGO_TICKET}*\n📌 ${t.TITULO}\n⚡ Prioridad: ${t.PRIORIDAD}\n\n` +
                `Ingresa al sistema para asignarlo.`,
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
    EN_PROGRESO: 'El equipo de soporte ya está trabajando en tu solicitud. Te notificaremos cuando esté resuelto.',
    RESUELTO:    '¡Tu ticket fue resuelto! Si el problema persiste, puedes reabrirlo respondiendo en el chat del ticket.',
    CERRADO:     'El ticket fue cerrado definitivamente. Puedes abrir uno nuevo si el problema persiste.',
    REABIERTO:   'El ticket fue reabierto y está pendiente de atención nuevamente.',
  };

  const icon = ESTADO_ICON[estadoNuevo] ?? '🔔';

  // Notificar al solicitante
  await notificar({
    email:         t.EMAIL_USUARIO,
    telefono:      t.TELEFONO_USUARIO,
    notifEmail:    t.NOTIF_EMAIL_USR,
    notifWhatsapp: t.NOTIF_WA_USR,
    subject:       `${icon} Tu ticket ${t.CODIGO_TICKET} — Estado: ${estadoNuevo}`,
    html: buildEmailHtml({
      titulo:    `${icon} Estado actualizado: ${estadoNuevo}`,
      cuerpo:    `Hola <strong>${t.NOMBRE_USUARIO}</strong>, el estado de tu ticket cambió de <strong>${estadoAnterior}</strong> a <strong>${estadoNuevo}</strong>.<br><br>${mensajeExtra[estadoNuevo] ?? ''}`,
      codigo:    t.CODIGO_TICKET,
      asunto:    t.TITULO,
      estado:    estadoNuevo,
      prioridad: t.PRIORIDAD,
    }),
    waText: `${icon} *Helpdesk — Estado actualizado*\n\n` +
            `Hola ${t.NOMBRE_USUARIO},\n\n` +
            `Tu ticket *${t.CODIGO_TICKET}* cambió:\n` +
            `${estadoAnterior} ➡️ *${estadoNuevo}*\n\n` +
            `${mensajeExtra[estadoNuevo] ?? ''}\n` +
            `📌 ${t.TITULO}`,
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
        titulo:    '🔄 El usuario reabrió el ticket',
        cuerpo:    `Hola <strong>${t.NOMBRE_TECNICO}</strong>, el usuario <strong>${t.NOMBRE_USUARIO}</strong> reabrió el ticket porque el problema no fue resuelto completamente.`,
        codigo:    t.CODIGO_TICKET,
        asunto:    t.TITULO,
        estado:    estadoNuevo,
        prioridad: t.PRIORIDAD,
      }),
      waText: `🔄 *Helpdesk — Ticket reabierto*\n\n` +
              `Hola ${t.NOMBRE_TECNICO}, el ticket *${t.CODIGO_TICKET}* fue reabierto por ${t.NOMBRE_USUARIO}.\n📌 ${t.TITULO}`,
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
        titulo:    '💬 Nueva respuesta del usuario',
        cuerpo:    `El usuario <strong>${t.NOMBRE_USUARIO}</strong> respondió en el ticket. Revisa su mensaje para dar seguimiento.`,
        codigo:    t.CODIGO_TICKET,
        asunto:    t.TITULO,
        estado:    t.ESTADO,
        prioridad: t.PRIORIDAD,
      }),
      waText: `💬 *Helpdesk — Nueva respuesta*\n\n` +
              `El usuario ${t.NOMBRE_USUARIO} respondió en el ticket *${t.CODIGO_TICKET}*.\nIngresa al sistema para ver el mensaje.`,
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
        titulo:    '💬 El soporte técnico te respondió',
        cuerpo:    `Hola <strong>${t.NOMBRE_USUARIO}</strong>, tienes una nueva respuesta del equipo de soporte en tu ticket.`,
        codigo:    t.CODIGO_TICKET,
        asunto:    t.TITULO,
        estado:    t.ESTADO,
        prioridad: t.PRIORIDAD,
      }),
      waText: `💬 *Helpdesk — Respuesta de soporte*\n\n` +
              `Hola ${t.NOMBRE_USUARIO},\n\nEl equipo de soporte respondió tu ticket *${t.CODIGO_TICKET}*.\nIngresa al sistema para ver la respuesta.`,
    });
  }
}

/** Bienvenida al crear un usuario → envía credenciales por email y WhatsApp */
export async function notificarBienvenida(params: {
  nombre:         string;
  email:          string;
  passwordPlano:  string;
  rol:            string;
  telefono:       string | null;
  notifEmail:     number;
  notifWhatsapp:  number;
}): Promise<void> {
  const { nombre, email, passwordPlano, rol, telefono, notifEmail, notifWhatsapp } = params;
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

  const waText = `👋 *Bienvenido al Helpdesk, ${nombre}!*\n\n` +
    `Tu cuenta ha sido creada como *${rolLabel[rol] ?? rol}*.\n\n` +
    `📧 *Correo:* ${email}\n` +
    `🔑 *Contraseña temporal:* ${passwordPlano}\n\n` +
    `${esPasante
      ? '⏳ Tu acceso está pendiente de aprobación por el administrador.'
      : `🔗 Ingresa en: ${url}/login`
    }\n\n` +
    `⚠️ Cambia tu contraseña al primer ingreso por seguridad.`;

  const promises: Promise<void>[] = [];
  if (notifEmail !== 0) promises.push(enviarEmail(email, 'Bienvenido — Tus credenciales de acceso', htmlEmail));
  if (notifWhatsapp === 1 && telefono) promises.push(enviarWhatsApp(telefono, waText));
  await Promise.allSettled(promises);
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
      titulo:    '⚠️ SLA Vencido — Atención requerida',
      cuerpo:    `Hola <strong>${destino.nombre}</strong>, el ticket <strong>${t.CODIGO_TICKET}</strong> ha superado su tiempo de respuesta (SLA) y requiere atención <strong style="color:#ef4444;">inmediata</strong>.`,
      codigo:    t.CODIGO_TICKET,
      asunto:    t.TITULO,
      estado:    t.ESTADO,
      prioridad: t.PRIORIDAD,
    }),
    waText: `⚠️ *Helpdesk — SLA Vencido*\n\n` +
            `Hola ${destino.nombre},\n\nEl ticket *${t.CODIGO_TICKET}* ha superado su SLA y requiere atención inmediata.\n\n` +
            `📌 ${t.TITULO}\n⚡ Prioridad: ${t.PRIORIDAD}\n\nIngresa al sistema para atenderlo.`,
  });
}

/** Asignación de técnico → avisar al técnico */
export async function notificarAsignacion(
  idTicket: number,
  idTecnico: number
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
      titulo:    '📋 Ticket asignado a ti',
      cuerpo:    `Hola <strong>${t.NOMBRE_TECNICO}</strong>, se te asignó el siguiente ticket. Revísalo e inicia la atención.`,
      codigo:    t.CODIGO_TICKET,
      asunto:    t.TITULO,
      estado:    t.ESTADO,
      prioridad: t.PRIORIDAD,
    }),
    waText: `📋 *Helpdesk — Ticket asignado*\n\n` +
            `Hola ${t.NOMBRE_TECNICO},\n\nSe te asignó el ticket *${t.CODIGO_TICKET}*:\n📌 ${t.TITULO}\n⚡ Prioridad: ${t.PRIORIDAD}\n\nIngresa al sistema para atenderlo.`,
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
