import { Response } from 'express';
import oracledb from 'oracledb';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { cache } from '../cache/appCache.js';
import { ticketEmitter } from '../events/ticketEvents.js';

const GYE = `- INTERVAL '5' HOUR`;

// ── Validadores ───────────────────────────────────────────────────────────────
const CreateTicketSchema = z.object({
  titulo:        z.string().min(5, 'Mínimo 5 caracteres').max(200),
  descripcion:   z.string().min(10, 'Mínimo 10 caracteres'),
  prioridad:     z.enum(['ALTA', 'MEDIA', 'BAJA']),
  id_categoria:  z.number().int().positive().default(1),
  id_tecnico:    z.number().int().positive().optional(),
  auto_asignar:  z.boolean().optional(),
});

const UpdateEstadoSchema = z.object({
  estado: z.enum(['ABIERTO', 'EN_PROGRESO', 'RESUELTO', 'CERRADO', 'REABIERTO']),
});

const AddCommentSchema = z.object({
  id_ticket:    z.number().int().positive(),
  texto:        z.string().min(1).max(4000),
  nuevo_estado: z.enum(['ABIERTO', 'EN_PROGRESO', 'RESUELTO', 'CERRADO', 'REABIERTO']).optional(),
  es_interno:   z.boolean().optional(),
});

const AsignarSchema = z.object({
  id_tecnico: z.number().int().positive().nullable(),
});

const ESTADOS_VALIDOS  = ['ABIERTO', 'EN_PROGRESO', 'RESUELTO', 'CERRADO', 'REABIERTO'] as const;
const PRIORIDADES_VALIDAS = ['ALTA', 'MEDIA', 'BAJA'] as const;

function getUserId(req: AuthRequest): number | null {
  const u = req.user as any;
  return u?.idUsuario ?? u?.id ?? null;
}

// ── GET /tickets  (con paginación + filtros) ──────────────────────────────────
export const getTickets = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });

  const id  = getUserId(req);
  const rol = req.user.rol;
  if (!id) return res.status(401).json({ error: 'Token mal formado' });

  // Query params
  const page     = Math.max(1, parseInt(req.query.page  as string) || 1);
  const limit    = Math.min(100, Math.max(5, parseInt(req.query.limit as string) || 20));
  const estado   = req.query.estado   as string | undefined;
  const prioridad= req.query.prioridad as string | undefined;
  const busqueda = (req.query.q as string | undefined)?.trim();
  const desde    = req.query.desde    as string | undefined;
  const hasta    = req.query.hasta    as string | undefined;
  const activos  = req.query.activos  === '1';   // excluye RESUELTO y CERRADO
  const offset   = (page - 1) * limit;

  const verTodos = ['ADMIN', 'TECNICO', 'PASANTE'].includes(rol);

  // Validar filtros opcionales
  if (estado    && !ESTADOS_VALIDOS.includes(estado as any))        return res.status(400).json({ error: 'Estado inválido' });
  if (prioridad && !PRIORIDADES_VALIDAS.includes(prioridad as any)) return res.status(400).json({ error: 'Prioridad inválida' });
  const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (desde && !ISO_DATE.test(desde)) return res.status(400).json({ error: 'Formato de fecha "desde" inválido' });
  if (hasta && !ISO_DATE.test(hasta)) return res.status(400).json({ error: 'Formato de fecha "hasta" inválido' });

  const cacheKey = `tickets:${verTodos ? 'all' : `u:${id}`}:p${page}:l${limit}:e${estado ?? ''}:pr${prioridad ?? ''}:q${busqueda ?? ''}:d${desde ?? ''}:h${hasta ?? ''}:a${activos ? '1' : '0'}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json(cached);

  let connection;
  try {
    connection = await oracledb.getConnection();

    const filterBinds: any = {};
    const conditions: string[] = ['1=1'];

    if (!verTodos) { conditions.push('t.ID_USUARIO = :id_user');  filterBinds.id_user   = id; }
    if (activos)   { conditions.push(`t.ESTADO NOT IN ('RESUELTO','CERRADO')`); }
    if (estado)    { conditions.push('t.ESTADO = :estado');       filterBinds.estado    = estado; }
    if (prioridad) { conditions.push('t.PRIORIDAD = :prioridad'); filterBinds.prioridad = prioridad; }
    if (busqueda)  {
      conditions.push(`(UPPER(t.TITULO) LIKE UPPER(:q) OR UPPER(t.CODIGO_TICKET) LIKE UPPER(:q))`);
      filterBinds.q = `%${busqueda}%`;
    }
    if (desde) {
      conditions.push(`TRUNC(t.FECHA_CREACION ${GYE}) >= TO_DATE(:desde, 'YYYY-MM-DD')`);
      filterBinds.desde = desde;
    }
    if (hasta) {
      conditions.push(`TRUNC(t.FECHA_CREACION ${GYE}) <= TO_DATE(:hasta, 'YYYY-MM-DD')`);
      filterBinds.hasta = hasta;
    }

    const where = conditions.join(' AND ');
    // pageBinds combina filtros + paginación solo para el SELECT principal
    const binds = { ...filterBinds, limit, offset };

    // Total para paginación (solo filterBinds, sin limit/offset)
    const countResult = await connection.execute(
      `SELECT COUNT(*) AS TOTAL FROM HD_TICKETS t WHERE ${where}`,
      filterBinds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const totalItems = Number((countResult.rows as any[])?.[0]?.TOTAL ?? 0);

    // Tickets de la página actual
    const sql = `
      SELECT
        t.ID_TICKET,
        t.ID_USUARIO,
        t.CODIGO_TICKET,
        t.TITULO,
        DBMS_LOB.SUBSTR(t.DESCRIPCION, 500, 1) AS DESCRIPCION,
        t.PRIORIDAD,
        t.ESTADO,
        t.CALIFICACION,
        t.ID_CATEGORIA,
        TO_CHAR(t.FECHA_CREACION ${GYE}, 'YYYY-MM-DD"T"HH24:MI:SS') AS FECHA_CREACION,
        TO_CHAR(t.FECHA_SLA      ${GYE}, 'YYYY-MM-DD"T"HH24:MI:SS') AS FECHA_SLA,
        u.NOMBRE  AS NOMBRE_USUARIO,
        t.ID_TECNICO,
        ut.NOMBRE AS NOMBRE_TECNICO,
        CASE WHEN t.FECHA_SLA IS NOT NULL AND t.FECHA_SLA < SYSTIMESTAMP
                  AND t.ESTADO NOT IN ('RESUELTO','CERRADO')
             THEN 1 ELSE 0 END AS SLA_VENCIDO
      FROM HD_TICKETS t
      JOIN HD_USUARIOS u  ON t.ID_USUARIO  = u.ID_USUARIO
      LEFT JOIN HD_USUARIOS ut ON t.ID_TECNICO = ut.ID_USUARIO
      WHERE ${where}
      ORDER BY t.FECHA_CREACION DESC
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

    const result = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

    const response = {
      tickets:     result.rows ?? [],
      totalItems,
      page,
      limit,
      totalPages:  Math.ceil(totalItems / limit),
    };

    cache.set(cacheKey, response, 15);
    return res.status(200).json(response);

  } catch (error: any) {
    console.error('Error en getTickets:', error.message);
    return res.status(500).json({ error: 'Error al obtener los tickets' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── POST /tickets ─────────────────────────────────────────────────────────────
export const createTicket = async (req: AuthRequest, res: Response) => {
  const parsed = CreateTicketSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const idUsuario = getUserId(req);
  if (!idUsuario) return res.status(401).json({ error: 'Sesión inválida' });

  const { titulo, descripcion, prioridad, id_categoria, id_tecnico, auto_asignar } = parsed.data;

  let connection;
  try {
    connection = await oracledb.getConnection();

    // Resolve technician: explicit > auto-assign > null
    let tecnicoFinal: number | null = id_tecnico ?? null;
    if (!tecnicoFinal && auto_asignar) {
      const autoRow = await connection.execute(
        `SELECT u.ID_USUARIO
         FROM HD_USUARIOS u
         WHERE u.ROL = 'TECNICO' AND u.ESTADO = 'ACTIVO'
         ORDER BY (
           SELECT COUNT(*) FROM HD_TICKETS t
           WHERE t.ID_TECNICO = u.ID_USUARIO AND t.ESTADO NOT IN ('RESUELTO','CERRADO')
         ) ASC
         FETCH FIRST 1 ROW ONLY`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      tecnicoFinal = (autoRow.rows as any[])?.[0]?.ID_USUARIO ?? null;
    }

    // SLA desde BD (HD_SLA_CONFIG) con fallback hardcoded
    let slaHoras = prioridad === 'ALTA' ? 4 : prioridad === 'BAJA' ? 72 : 24;
    try {
      const slaRow = await connection.execute(
        `SELECT HORAS_LIMITE FROM HD_SLA_CONFIG WHERE PRIORIDAD = :p`,
        { p: prioridad }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const h = (slaRow.rows as any[])?.[0]?.HORAS_LIMITE;
      if (h) slaHoras = Number(h);
    } catch { /* usa fallback */ }

    const result = await connection.execute(
      `INSERT INTO HD_TICKETS
         (TITULO, DESCRIPCION, PRIORIDAD, ID_USUARIO, ID_CATEGORIA, ESTADO, ID_TECNICO)
       VALUES (:titulo, :descripcion, :prioridad, :id_usuario, :id_categoria, 'ABIERTO', :id_tecnico)
       RETURNING ID_TICKET INTO :id_ticket`,
      {
        titulo, descripcion, prioridad,
        id_usuario:   idUsuario,
        id_categoria,
        id_tecnico:   tecnicoFinal,
        id_ticket:    { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: false }
    );

    const idTicket = (result.outBinds as any)?.id_ticket?.[0];
    const codigo = `HLP-${new Date().getFullYear()}-${String(idTicket).padStart(6, '0')}`;

    // Set CODIGO_TICKET (zero-padded) + FECHA_SLA en un solo UPDATE
    await connection.execute(
      `UPDATE HD_TICKETS
          SET CODIGO_TICKET = :codigo,
              FECHA_SLA     = SYSTIMESTAMP + :sla_h / 24
        WHERE ID_TICKET = :id`,
      { codigo, sla_h: slaHoras, id: idTicket },
      { autoCommit: true }
    );

    ticketEmitter.emit('ticket.created', { idTicket, idUsuario, codigoTicket: codigo });

    return res.status(201).json({ mensaje: 'Ticket creado exitosamente', codigo, idTicket });

  } catch (error: any) {
    console.error('Error al crear ticket:', error.message);
    return res.status(500).json({ error: 'Error al crear el ticket' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── PUT /tickets/:id/estado ───────────────────────────────────────────────────
export const updateTicketStatus = async (req: AuthRequest, res: Response) => {
  const parsed = UpdateEstadoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const idTicket  = Number(req.params.id);
  const idUsuario = getUserId(req);
  if (!idUsuario) return res.status(401).json({ error: 'Token mal formado' });

  const { estado: estadoNuevo } = parsed.data;
  let connection;
  try {
    connection = await oracledb.getConnection();

    const current = await connection.execute(
      `SELECT ESTADO FROM HD_TICKETS WHERE ID_TICKET = :id`,
      { id: idTicket },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const estadoAnterior: string = (current.rows as any[])?.[0]?.ESTADO ?? 'ABIERTO';

    const upd = await connection.execute(
      `UPDATE HD_TICKETS SET ESTADO = :estado WHERE ID_TICKET = :id`,
      { estado: estadoNuevo, id: idTicket },
      { autoCommit: true }
    );

    if (upd.rowsAffected === 0) return res.status(404).json({ error: 'Ticket no encontrado' });

    ticketEmitter.emit('ticket.status_changed', { idTicket, idUsuario, estadoAnterior, estadoNuevo });
    cache.invalidate('tickets:');

    return res.status(200).json({ mensaje: `Estado actualizado a ${estadoNuevo}` });

  } catch (error: any) {
    console.error('Error al actualizar estado:', error.message);
    return res.status(500).json({ error: 'Error al actualizar el estado' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── PUT /tickets/:id/reabrir ─────────────────────────────────────────────────
export const reabrirTicket = async (req: AuthRequest, res: Response) => {
  const idTicket  = Number(req.params.id);
  const idUsuario = getUserId(req);
  if (!idUsuario) return res.status(401).json({ error: 'Token mal formado' });

  let connection;
  try {
    connection = await oracledb.getConnection();

    const result = await connection.execute(
      `SELECT ESTADO, ID_USUARIO FROM HD_TICKETS WHERE ID_TICKET = :id`,
      { id: idTicket },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = (result.rows as any[])?.[0];
    if (!row) return res.status(404).json({ error: 'Ticket no encontrado' });
    if (row.ESTADO !== 'CERRADO') return res.status(400).json({ error: 'Solo se pueden reabrir tickets cerrados' });
    if (row.ID_USUARIO !== idUsuario) return res.status(403).json({ error: 'Solo el solicitante puede reabrir el ticket' });

    await connection.execute(
      `UPDATE HD_TICKETS SET ESTADO = 'REABIERTO' WHERE ID_TICKET = :id`,
      { id: idTicket },
      { autoCommit: true }
    );

    ticketEmitter.emit('ticket.status_changed', { idTicket, idUsuario, estadoAnterior: 'CERRADO', estadoNuevo: 'REABIERTO' });
    cache.invalidate('tickets:');

    return res.status(200).json({ mensaje: 'Ticket reabierto exitosamente' });

  } catch (error: any) {
    console.error('Error al reabrir ticket:', error.message);
    return res.status(500).json({ error: 'Error al reabrir el ticket' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── PUT /tickets/:id/asignar ──────────────────────────────────────────────────
export const asignarTicket = async (req: AuthRequest, res: Response) => {
  const parsed = AsignarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ID de técnico inválido' });

  const idTicket  = Number(req.params.id);
  const idUsuario = getUserId(req);
  if (!idUsuario) return res.status(401).json({ error: 'Token mal formado' });

  const { id_tecnico } = parsed.data;
  let connection;
  try {
    connection = await oracledb.getConnection();

    const upd = await connection.execute(
      `UPDATE HD_TICKETS SET ID_TECNICO = :id_tecnico WHERE ID_TICKET = :id`,
      { id_tecnico, id: idTicket },
      { autoCommit: true }
    );

    if (upd.rowsAffected === 0) return res.status(404).json({ error: 'Ticket no encontrado' });

    // Registrar en historial
    ticketEmitter.emit('ticket.status_changed', {
      idTicket,
      idUsuario,
      estadoAnterior: 'ASIGNACION',
      estadoNuevo:    id_tecnico ? `ASIGNADO:${id_tecnico}` : 'DESASIGNADO',
    });
    cache.invalidate('tickets:');

    return res.status(200).json({ mensaje: 'Ticket asignado correctamente' });

  } catch (error: any) {
    console.error('Error al asignar ticket:', error.message);
    return res.status(500).json({ error: 'Error al asignar el ticket' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── PUT /tickets/:id/sla — Actualizar fecha límite SLA (ADMIN/TECNICO) ────────
export const updateSLA = async (req: AuthRequest, res: Response) => {
  const idTicket = Number(req.params.id);
  if (!idTicket || isNaN(idTicket)) return res.status(400).json({ error: 'ID inválido' });

  const { fecha_sla } = req.body;
  if (!fecha_sla || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fecha_sla)) {
    return res.status(400).json({ error: 'Formato inválido. Use YYYY-MM-DDTHH:MM' });
  }

  const idUsuario = getUserId(req);
  if (!idUsuario) return res.status(401).json({ error: 'Sesión inválida' });

  let connection;
  try {
    connection = await oracledb.getConnection();

    const existing = await connection.execute(
      `SELECT ID_TICKET FROM HD_TICKETS WHERE ID_TICKET = :id AND ESTADO NOT IN ('RESUELTO','CERRADO')`,
      { id: idTicket },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((existing.rows as any[]).length === 0) {
      return res.status(404).json({ error: 'Ticket no encontrado o ya cerrado' });
    }

    // fecha_sla viene en hora Ecuador (UTC-5) → sumar 5h para guardar en UTC en Oracle
    const fechaOracle = fecha_sla.replace('T', ' ') + ':00';

    await connection.execute(
      `UPDATE HD_TICKETS
          SET FECHA_SLA          = TO_TIMESTAMP(:fecha, 'YYYY-MM-DD HH24:MI:SS') + INTERVAL '5' HOUR,
              SLA_ALERTA_ENVIADA = 0
        WHERE ID_TICKET = :id`,
      { fecha: fechaOracle, id: idTicket },
      { autoCommit: true }
    );

    ticketEmitter.emit('ticket.status_changed', {
      idTicket, idUsuario,
      estadoAnterior: 'SLA_ANTERIOR',
      estadoNuevo:    `SLA_NUEVO:${fecha_sla}`,
    });
    cache.invalidate('tickets:');

    return res.status(200).json({ mensaje: 'SLA actualizado correctamente' });

  } catch (error: any) {
    console.error('Error al actualizar SLA:', error.message);
    return res.status(500).json({ error: 'Error al actualizar el SLA' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── POST /tickets/comentario ──────────────────────────────────────────────────
export const addComment = async (req: AuthRequest, res: Response) => {
  const parsed = AddCommentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const id_usuario = getUserId(req);
  if (!id_usuario) return res.status(400).json({ error: 'Sesión inválida' });

  const { id_ticket, texto, nuevo_estado, es_interno } = parsed.data;
  const rol = req.user?.rol;

  // Solo ADMIN/TECNICO pueden crear notas internas
  if (es_interno && rol !== 'ADMIN' && rol !== 'TECNICO') {
    return res.status(403).json({ error: 'Solo técnicos y administradores pueden crear notas internas' });
  }

  let connection;
  try {
    connection = await oracledb.getConnection();

    await connection.execute(
      `INSERT INTO HD_COMENTARIOS (ID_TICKET, ID_USUARIO, TEXTO, ES_INTERNO, FECHA_CREACION) VALUES (:id_ticket, :id_usuario, :texto, :es_interno, SYSTIMESTAMP)`,
      { id_ticket, id_usuario, texto, es_interno: es_interno ? 1 : 0 }
    );

    // Leer el estado actual y el dueño del ticket (para auto-reabierto)
    const currentTicket = await connection.execute(
      `SELECT ESTADO, ID_USUARIO FROM HD_TICKETS WHERE ID_TICKET = :id`,
      { id: id_ticket },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const ticketRow = (currentTicket.rows as any[])?.[0];
    const estadoActual: string   = ticketRow?.ESTADO      ?? 'ABIERTO';
    const duenioTicket: number   = ticketRow?.ID_USUARIO  ?? 0;

    // Determinar si hay cambio de estado — guardamos para emitir DESPUÉS del commit
    let estadoCambiado: { anterior: string; nuevo: string } | null = null;

    // Auto-reabierto: si el dueño comenta en un ticket RESUELTO, lo reabre
    if (estadoActual === 'RESUELTO' && id_usuario === duenioTicket && !nuevo_estado) {
      await connection.execute(
        `UPDATE HD_TICKETS SET ESTADO = 'REABIERTO' WHERE ID_TICKET = :id`,
        { id: id_ticket }
      );
      estadoCambiado = { anterior: 'RESUELTO', nuevo: 'REABIERTO' };
    } else if (nuevo_estado) {
      if (rol === 'USUARIO' || rol === 'PASANTE') {
        await connection.rollback();
        await connection.close();
        connection = undefined as any;
        return res.status(403).json({ error: 'No tienes permiso para cambiar el estado' });
      }

      await connection.execute(
        `UPDATE HD_TICKETS SET ESTADO = :estado WHERE ID_TICKET = :id`,
        { estado: nuevo_estado, id: id_ticket }
      );
      estadoCambiado = { anterior: estadoActual, nuevo: nuevo_estado };
    }

    // Commit ANTES de emitir eventos — garantiza que getTicketInfo lea datos consistentes
    await connection.commit();
    cache.invalidate('tickets:');

    // Emitir eventos después del commit
    if (estadoCambiado) {
      ticketEmitter.emit('ticket.status_changed', {
        idTicket: id_ticket, idUsuario: id_usuario,
        estadoAnterior: estadoCambiado.anterior, estadoNuevo: estadoCambiado.nuevo,
      });
    }
    ticketEmitter.emit('ticket.commented', { idTicket: id_ticket, idUsuario: id_usuario, detalle: texto });

    return res.status(201).json({ mensaje: 'Comentario añadido correctamente' });

  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error('Error en addComment:', error.message);
    return res.status(500).json({ error: 'Error al procesar el comentario' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── GET /tickets/:id/comentarios ──────────────────────────────────────────────
export const getCommentsByTicket = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  let connection;
  try {
    connection = await oracledb.getConnection();

    const rol = req.user?.rol ?? 'USUARIO';
    const verInternas = ['ADMIN', 'TECNICO'].includes(rol);

    const result = await connection.execute(
      `SELECT
         c.ID_COMENTARIO,
         DBMS_LOB.SUBSTR(c.TEXTO, 4000, 1) AS TEXTO,
         TO_CHAR(c.FECHA_CREACION ${GYE}, 'YYYY-MM-DD"T"HH24:MI:SS') AS FECHA_CREACION,
         c.ID_USUARIO,
         u.NOMBRE     AS NOMBRE_AUTOR,
         u.ROL        AS ROL_AUTOR,
         c.ES_INTERNO
       FROM HD_COMENTARIOS c
       JOIN HD_USUARIOS u ON c.ID_USUARIO = u.ID_USUARIO
       WHERE c.ID_TICKET = :id
         AND (${verInternas ? '1=1' : 'c.ES_INTERNO = 0'})
       ORDER BY c.FECHA_CREACION ASC`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return res.status(200).json(result.rows ?? []);
  } catch (error: any) {
    console.error('Error al obtener comentarios:', error.message);
    return res.status(500).json({ error: 'Error al obtener los comentarios' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── GET /tickets/trend ────────────────────────────────────────────────────────
export const getTicketTrend = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  const cacheKey = 'tickets:trend';
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json(cached);
  let conn;
  try {
    conn = await oracledb.getConnection();
    const result = await conn.execute(
      `SELECT TO_CHAR(FECHA_CREACION - INTERVAL '5' HOUR,'YYYY-MM-DD') AS DIA,
              COUNT(*) AS TOTAL
       FROM HD_TICKETS
       WHERE FECHA_CREACION >= SYSDATE - 90
       GROUP BY TO_CHAR(FECHA_CREACION - INTERVAL '5' HOUR,'YYYY-MM-DD')
       ORDER BY DIA ASC`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const rows = result.rows ?? [];
    cache.set(cacheKey, rows, 60);
    return res.json(rows);
  } catch (err: any) {
    console.error('Error en getTicketTrend:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
};

// ── GET /tickets/stats ────────────────────────────────────────────────────────
export const getTicketStats = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });

  const id  = getUserId(req);
  const rol = req.user.rol;
  if (!id) return res.status(401).json({ error: 'Token mal formado' });

  const verTodos = ['ADMIN', 'TECNICO', 'PASANTE'].includes(rol);
  const cacheKey = `stats:${verTodos ? 'all' : `u:${id}`}`;

  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json(cached);

  let connection;
  try {
    connection = await oracledb.getConnection();

    let sql = `SELECT NVL(ESTADO,'ABIERTO') AS ESTADO, COUNT(*) AS TOTAL FROM HD_TICKETS`;
    const binds: any = {};
    if (!verTodos) { sql += ` WHERE ID_USUARIO = :id_user`; binds.id_user = id; }
    sql += ` GROUP BY NVL(ESTADO,'ABIERTO')`;

    const result = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    cache.set(cacheKey, result.rows, 30);
    return res.status(200).json(result.rows ?? []);

  } catch (error: any) {
    console.error('Error en getTicketStats:', error.message);
    return res.status(500).json({ error: 'Error al obtener métricas' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── PUT /tickets/:id/calificar ────────────────────────────────────────────────
const CalificarSchema = z.object({ calificacion: z.number().int().min(1).max(5) });

export const calificarTicket = async (req: AuthRequest, res: Response) => {
  const parsed = CalificarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Calificación debe ser entre 1 y 5' });

  const idTicket  = Number(req.params.id);
  const idUsuario = getUserId(req);
  if (!idUsuario) return res.status(401).json({ error: 'Sesión inválida' });

  let connection;
  try {
    connection = await oracledb.getConnection();

    const ticket = await connection.execute(
      `SELECT ESTADO, ID_USUARIO, CALIFICACION FROM HD_TICKETS WHERE ID_TICKET = :id`,
      { id: idTicket },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = (ticket.rows as any[])?.[0];
    if (!row) return res.status(404).json({ error: 'Ticket no encontrado' });
    if (row.ID_USUARIO !== idUsuario) return res.status(403).json({ error: 'Solo el creador puede calificar' });
    if (row.ESTADO !== 'RESUELTO') return res.status(400).json({ error: 'Solo se puede calificar tickets resueltos' });

    await connection.execute(
      `UPDATE HD_TICKETS SET CALIFICACION = :cal WHERE ID_TICKET = :id`,
      { cal: parsed.data.calificacion, id: idTicket },
      { autoCommit: true }
    );
    cache.invalidate('tickets:');
    return res.status(200).json({ mensaje: 'Calificación guardada', calificacion: parsed.data.calificacion });

  } catch (error: any) {
    console.error('Error al calificar ticket:', error.message);
    return res.status(500).json({ error: 'Error al calificar el ticket' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── GET /tickets/:id/adjuntos ─────────────────────────────────────────────────
export const getAdjuntos = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(
      `SELECT ID_ADJUNTO, NOMBRE_ORIGINAL, MIME_TYPE, TAMANIO,
              TO_CHAR(FECHA_SUBIDA ${GYE}, 'YYYY-MM-DD"T"HH24:MI:SS') AS FECHA_SUBIDA,
              u.NOMBRE AS SUBIDO_POR
       FROM HD_ADJUNTOS a
       JOIN HD_USUARIOS u ON a.ID_USUARIO = u.ID_USUARIO
       WHERE a.ID_TICKET = :id
       ORDER BY a.FECHA_SUBIDA ASC`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.status(200).json(result.rows ?? []);
  } catch (error: any) {
    console.error('Error al obtener adjuntos:', error.message);
    return res.status(500).json({ error: 'Error al obtener adjuntos' });
  } finally {
    if (connection) await connection.close();
  }
};
