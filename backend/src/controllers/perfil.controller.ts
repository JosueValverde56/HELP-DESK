import { Response } from 'express';
import oracledb from 'oracledb';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware.js';

const GYE = `- INTERVAL '5' HOUR`;

const UpdatePerfilSchema = z.object({
  nombre:         z.string().min(2, 'Mínimo 2 caracteres').max(100).optional(),
  telefono:       z.string().max(20).optional().nullable(),
  notif_email:    z.number().int().min(0).max(1).optional(),
  notif_whatsapp: z.number().int().min(0).max(1).optional(),
});

function myId(req: AuthRequest): number {
  return (req.user as any)?.idUsuario ?? 0;
}

// ── GET /api/me/perfil ────────────────────────────────────────────────────────
export const getMePerfil = async (req: AuthRequest, res: Response) => {
  const id = myId(req);
  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(
      `SELECT ID_USUARIO, NOMBRE, EMAIL, ROL, ESTADO, TELEFONO, NOTIF_EMAIL, NOTIF_WHATSAPP,
              TO_CHAR(FECHA_CREACION ${GYE}, 'YYYY-MM-DD"T"HH24:MI:SS') AS FECHA_CREACION
       FROM HD_USUARIOS WHERE ID_USUARIO = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = (result.rows as any[])?.[0];
    if (!row) return res.status(404).json({ error: 'Usuario no encontrado' });
    return res.status(200).json(row);
  } catch (error: any) {
    console.error('Error en getMePerfil:', error.message);
    return res.status(500).json({ error: 'Error al obtener el perfil' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── PUT /api/me/perfil ────────────────────────────────────────────────────────
export const updateMePerfil = async (req: AuthRequest, res: Response) => {
  const id = myId(req);
  const parsed = UpdatePerfilSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { nombre, telefono, notif_email, notif_whatsapp } = parsed.data;
  if (!nombre && telefono === undefined && notif_email === undefined && notif_whatsapp === undefined) {
    return res.status(400).json({ error: 'No se enviaron campos a actualizar' });
  }

  let connection;
  try {
    connection = await oracledb.getConnection();

    const setClauses: string[] = [];
    const binds: any = { id };
    if (nombre !== undefined)           { setClauses.push('NOMBRE = :nombre');          binds.nombre = nombre; }
    if (telefono !== undefined)         { setClauses.push('TELEFONO = :telefono');       binds.telefono = telefono; }
    if (notif_email !== undefined)      { setClauses.push('NOTIF_EMAIL = :ne');          binds.ne = notif_email; }
    if (notif_whatsapp !== undefined)   { setClauses.push('NOTIF_WHATSAPP = :nw');       binds.nw = notif_whatsapp; }

    await connection.execute(
      `UPDATE HD_USUARIOS SET ${setClauses.join(', ')} WHERE ID_USUARIO = :id`,
      binds,
      { autoCommit: true }
    );

    return res.status(200).json({ mensaje: 'Perfil actualizado exitosamente' });
  } catch (error: any) {
    console.error('Error en updateMePerfil:', error.message);
    return res.status(500).json({ error: 'Error al actualizar el perfil' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── GET /api/me/stats — Estadísticas personales (útil para TECNICO) ───────────
export const getMeStats = async (req: AuthRequest, res: Response) => {
  const id = myId(req);
  let connection;
  try {
    connection = await oracledb.getConnection();

    const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
    const [rAsignados, rResueltosHoy, rHoras, rSlaVencidos] = await Promise.all([
      // Tickets activos asignados a mí
      connection.execute(
        `SELECT COUNT(*) AS TOTAL FROM HD_TICKETS
         WHERE ID_TECNICO = :id AND ESTADO NOT IN ('RESUELTO','CERRADO')`,
        { id }, opts
      ),
      // Resueltos hoy (mi acción)
      connection.execute(
        `SELECT COUNT(*) AS TOTAL FROM HD_HISTORIAL_TICKETS
         WHERE ID_USUARIO = :id
           AND ACCION = 'CAMBIO_ESTADO'
           AND ESTADO_NUEVO = 'RESUELTO'
           AND TRUNC(FECHA ${GYE}) = TRUNC(SYSDATE ${GYE})`,
        { id }, opts
      ),
      // Tiempo promedio resolución en horas
      connection.execute(
        `SELECT ROUND(AVG(
           (CAST(h.FECHA AS DATE) - CAST(t.FECHA_CREACION AS DATE)) * 24
         ), 1) AS HORAS_PROMEDIO
         FROM HD_TICKETS t
         JOIN HD_HISTORIAL_TICKETS h
           ON t.ID_TICKET = h.ID_TICKET
          AND h.ACCION = 'CAMBIO_ESTADO'
          AND h.ESTADO_NUEVO = 'RESUELTO'
         WHERE t.ID_TECNICO = :id`,
        { id }, opts
      ),
      // Mis tickets con SLA vencido
      connection.execute(
        `SELECT COUNT(*) AS TOTAL FROM HD_TICKETS
         WHERE ID_TECNICO = :id
           AND FECHA_SLA IS NOT NULL
           AND FECHA_SLA < SYSTIMESTAMP
           AND ESTADO NOT IN ('RESUELTO','CERRADO')`,
        { id }, opts
      ),
    ]);

    return res.status(200).json({
      asignados:     Number((rAsignados.rows     as any[])?.[0]?.TOTAL          ?? 0),
      resueltosHoy:  Number((rResueltosHoy.rows  as any[])?.[0]?.TOTAL          ?? 0),
      horasPromedio: Number((rHoras.rows          as any[])?.[0]?.HORAS_PROMEDIO ?? 0),
      slaVencidos:   Number((rSlaVencidos.rows    as any[])?.[0]?.TOTAL          ?? 0),
    });
  } catch (error: any) {
    console.error('Error en getMeStats:', error.message);
    return res.status(500).json({ error: 'Error al obtener las estadísticas' });
  } finally {
    if (connection) await connection.close();
  }
};
