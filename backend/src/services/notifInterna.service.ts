import oracledb from 'oracledb';
import { getIo } from '../socket/socketInstance.js';

interface NotifPayload {
  idUsuario: number;
  titulo:    string;
  mensaje:   string;
  tipo:      string;
  idTicket?: number | null;
}

async function crearNotif(n: NotifPayload): Promise<void> {
  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(
      `INSERT INTO HD_NOTIFICACIONES (ID_USUARIO, TITULO, MENSAJE, TIPO, ID_TICKET)
       VALUES (:idUsuario, :titulo, :mensaje, :tipo, :idTicket)
       RETURNING ID_NOTIF INTO :idNotif`,
      {
        idUsuario: n.idUsuario,
        titulo:    n.titulo.substring(0, 200),
        mensaje:   n.mensaje.substring(0, 500),
        tipo:      n.tipo,
        idTicket:  n.idTicket ?? null,
        idNotif:   { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );
    const idNotif = (result.outBinds as any)?.idNotif?.[0];
    getIo()?.to(`user:${n.idUsuario}`).emit('notif:nueva', {
      ID_NOTIF:       idNotif,
      TITULO:         n.titulo,
      MENSAJE:        n.mensaje,
      TIPO:           n.tipo,
      ID_TICKET:      n.idTicket ?? null,
      FECHA_CREACION: new Date().toISOString(),
      LEIDA:          0,
    });
  } catch (err: any) {
    console.error('❌ notifInterna:', err.message);
  } finally {
    if (connection) await connection.close();
  }
}

async function getTicketInfo(idTicket: number): Promise<{ CODIGO_TICKET: string; ID_USUARIO: number; ID_TECNICO: number | null } | null> {
  let connection;
  try {
    connection = await oracledb.getConnection();
    const r = await connection.execute(
      `SELECT CODIGO_TICKET, ID_USUARIO, ID_TECNICO FROM HD_TICKETS WHERE ID_TICKET = :id`,
      { id: idTicket },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return (r.rows as any[])?.[0] ?? null;
  } finally {
    if (connection) await connection.close();
  }
}

// Ticket creado → notificar a todos los ADMIN + TECNICO
export async function notifInterna_TicketCreado(idTicket: number, codigoTicket: string): Promise<void> {
  let connection;
  try {
    connection = await oracledb.getConnection();
    const r = await connection.execute(
      `SELECT ID_USUARIO FROM HD_USUARIOS WHERE ROL IN ('ADMIN', 'TECNICO') AND ESTADO = 'ACTIVO'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    await connection.close();
    connection = undefined as any;
    for (const u of r.rows as any[]) {
      await crearNotif({
        idUsuario: u.ID_USUARIO,
        titulo:   'Nuevo ticket',
        mensaje:  `Se creó el ticket ${codigoTicket}`,
        tipo:     'ticket_nuevo',
        idTicket,
      });
    }
  } catch (err: any) {
    console.error('❌ notifInterna_TicketCreado:', err.message);
  } finally {
    if (connection) await connection.close();
  }
}

// Estado cambiado → notificar al creador del ticket
export async function notifInterna_EstadoCambiado(idTicket: number, estadoNuevo: string): Promise<void> {
  try {
    const info = await getTicketInfo(idTicket);
    if (!info) return;
    const etiquetas: Record<string, string> = {
      RESUELTO:    `Tu ticket ${info.CODIGO_TICKET} fue resuelto ✅`,
      CERRADO:     `Tu ticket ${info.CODIGO_TICKET} fue cerrado`,
      EN_PROGRESO: `Tu ticket ${info.CODIGO_TICKET} está en progreso 🔧`,
      REABIERTO:   `Tu ticket ${info.CODIGO_TICKET} fue reabierto`,
      ABIERTO:     `Tu ticket ${info.CODIGO_TICKET} está abierto`,
    };
    await crearNotif({
      idUsuario: info.ID_USUARIO,
      titulo:   estadoNuevo === 'RESUELTO' ? '¡Ticket resuelto!' : `Ticket ${estadoNuevo.replace('_', ' ')}`,
      mensaje:  etiquetas[estadoNuevo] ?? `Ticket ${info.CODIGO_TICKET} → ${estadoNuevo}`,
      tipo:     'estado',
      idTicket,
    });
  } catch (err: any) {
    console.error('❌ notifInterna_EstadoCambiado:', err.message);
  }
}

// Ticket asignado → notificar al técnico
export async function notifInterna_Asignado(idTicket: number, idTecnico: number): Promise<void> {
  try {
    const info = await getTicketInfo(idTicket);
    if (!info) return;
    await crearNotif({
      idUsuario: idTecnico,
      titulo:   'Ticket asignado',
      mensaje:  `Se te asignó el ticket ${info.CODIGO_TICKET}`,
      tipo:     'asignacion',
      idTicket,
    });
  } catch (err: any) {
    console.error('❌ notifInterna_Asignado:', err.message);
  }
}

// Comentario → notificar a la otra parte
export async function notifInterna_Comentario(idTicket: number, idComentador: number): Promise<void> {
  let connection;
  try {
    connection = await oracledb.getConnection();
    const r = await connection.execute(
      `SELECT t.ID_USUARIO AS CREADOR, t.ID_TECNICO, t.CODIGO_TICKET, u.ROL AS ROL_COMENT
       FROM HD_TICKETS t
       JOIN HD_USUARIOS u ON u.ID_USUARIO = :idComentador
       WHERE t.ID_TICKET = :id`,
      { id: idTicket, idComentador },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = (r.rows as any[])?.[0];
    if (!row) return;
    await connection.close();
    connection = undefined as any;

    const esStaff = ['ADMIN', 'TECNICO', 'PASANTE'].includes(row.ROL_COMENT);

    if (esStaff && row.CREADOR !== idComentador) {
      await crearNotif({
        idUsuario: row.CREADOR,
        titulo:   'Respuesta en tu ticket',
        mensaje:  `Nuevo comentario en tu ticket ${row.CODIGO_TICKET}`,
        tipo:     'comentario',
        idTicket,
      });
    } else if (!esStaff && row.ID_TECNICO && row.ID_TECNICO !== idComentador) {
      await crearNotif({
        idUsuario: row.ID_TECNICO,
        titulo:   'Comentario de usuario',
        mensaje:  `El usuario comentó en el ticket ${row.CODIGO_TICKET}`,
        tipo:     'comentario',
        idTicket,
      });
    }
  } catch (err: any) {
    console.error('❌ notifInterna_Comentario:', err.message);
  } finally {
    if (connection) await connection.close();
  }
}
