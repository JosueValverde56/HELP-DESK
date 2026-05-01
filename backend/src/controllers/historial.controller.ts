import { Response } from 'express';
import oracledb from 'oracledb';
import { AuthRequest } from '../middleware/auth.middleware.js';

export const getHistorialByTicket = async (req: AuthRequest, res: Response) => {
  const idTicket = Number(req.params.id);
  if (!idTicket || isNaN(idTicket)) {
    return res.status(400).json({ error: 'ID de ticket inválido' });
  }

  let connection;
  try {
    connection = await oracledb.getConnection();

    const result = await connection.execute(
      `SELECT
         h.ID_HISTORIAL,
         h.ACCION,
         h.ESTADO_ANTERIOR,
         h.ESTADO_NUEVO,
         h.DETALLE,
         TO_CHAR(h.FECHA - INTERVAL '5' HOUR, 'YYYY-MM-DD"T"HH24:MI:SS') AS FECHA,
         u.NOMBRE  AS NOMBRE_USUARIO,
         u.ROL     AS ROL_USUARIO
       FROM HD_HISTORIAL_TICKETS h
       JOIN HD_USUARIOS u ON h.ID_USUARIO = u.ID_USUARIO
       WHERE h.ID_TICKET = :idTicket
       ORDER BY h.FECHA ASC`,
      { idTicket },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return res.status(200).json(result.rows ?? []);
  } catch (error: any) {
    console.error('🚨 Error al obtener historial:', error.message);
    return res.status(500).json({ error: 'Error al obtener el historial del ticket' });
  } finally {
    if (connection) await connection.close();
  }
};
