import { Response } from 'express';
import oracledb from 'oracledb';
import { AuthRequest } from '../middleware/auth.middleware.js';

export const getNotificaciones = async (req: AuthRequest, res: Response) => {
  const idUsuario = (req.user as any)?.idUsuario;
  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(
      `SELECT ID_NOTIF, TITULO, MENSAJE, TIPO, ID_TICKET, LEIDA, FECHA_CREACION
       FROM HD_NOTIFICACIONES
       WHERE ID_USUARIO = :idUsuario
       ORDER BY FECHA_CREACION DESC
       FETCH FIRST 30 ROWS ONLY`,
      { idUsuario },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const rows = result.rows as any[];
    res.json({ notificaciones: rows, noLeidas: rows.filter(n => n.LEIDA === 0).length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.close();
  }
};

export const marcarLeida = async (req: AuthRequest, res: Response) => {
  const idUsuario = (req.user as any)?.idUsuario;
  let connection;
  try {
    connection = await oracledb.getConnection();
    await connection.execute(
      `UPDATE HD_NOTIFICACIONES SET LEIDA = 1 WHERE ID_NOTIF = :id AND ID_USUARIO = :idUsuario`,
      { id: Number(req.params.id), idUsuario },
      { autoCommit: true }
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.close();
  }
};

export const marcarTodasLeidas = async (req: AuthRequest, res: Response) => {
  const idUsuario = (req.user as any)?.idUsuario;
  let connection;
  try {
    connection = await oracledb.getConnection();
    await connection.execute(
      `UPDATE HD_NOTIFICACIONES SET LEIDA = 1 WHERE ID_USUARIO = :idUsuario AND LEIDA = 0`,
      { idUsuario },
      { autoCommit: true }
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.close();
  }
};
