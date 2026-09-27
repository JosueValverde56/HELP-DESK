import { Response } from 'express';
import oracledb from 'oracledb';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { cache } from '../cache/appCache.js';

const CACHE_KEY = 'anydesk';

const UpdateAnydeskSchema = z.object({
  codigo_anydesk:   z.string().max(50).nullable(),
  password_anydesk: z.string().max(100).nullable().optional(),
});

// ── GET /anydesk ──────────────────────────────────────────────────────────────
export const getAnydesk = async (_req: AuthRequest, res: Response) => {
  const cached = cache.get(CACHE_KEY);
  if (cached) return res.status(200).json(cached);

  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(
      `SELECT
         a.ID_ANYDESK,
         a.ID_DEPARTAMENTO,
         d.NOMBRE              AS NOMBRE_DEPARTAMENTO,
         a.CODIGO_ANYDESK,
         a.PASSWORD_ANYDESK,
         u.NOMBRE              AS ACTUALIZADO_POR,
         TO_CHAR(a.FECHA_ACTUALIZACION - INTERVAL '5' HOUR, 'YYYY-MM-DD"T"HH24:MI:SS') AS FECHA_ACTUALIZACION
       FROM HD_ANYDESK_DEPARTAMENTOS a
       JOIN HD_DEPARTAMENTOS d ON d.ID_DEPARTAMENTO = a.ID_DEPARTAMENTO
       LEFT JOIN HD_USUARIOS u  ON u.ID_USUARIO     = a.ACTUALIZADO_POR
       WHERE d.ESTADO = 'ACTIVO'
       ORDER BY d.NOMBRE`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    cache.set(CACHE_KEY, result.rows ?? [], 60);
    return res.status(200).json(result.rows ?? []);
  } catch (error: any) {
    console.error('Error al listar AnyDesk:', error.message);
    return res.status(500).json({ error: 'Error al obtener códigos AnyDesk' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── POST /anydesk/:id/log ────────────────────────────────────────────────────
export const registrarConexionAnydesk = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  const idUsuario = (req.user as any)?.idUsuario;

  let connection;
  try {
    connection = await oracledb.getConnection();
    await connection.execute(
      `INSERT INTO HD_ANYDESK_LOG (ID_ANYDESK, ID_USUARIO) VALUES (:idAnydesk, :idUsuario)`,
      { idAnydesk: id, idUsuario },
      { autoCommit: true }
    );
    return res.status(201).json({ mensaje: 'Conexión registrada' });
  } catch (error: any) {
    console.error('Error al registrar conexión AnyDesk:', error.message);
    return res.status(500).json({ error: 'Error al registrar la conexión' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── GET /anydesk/logs ────────────────────────────────────────────────────────
export const getAnydeskLogs = async (_req: AuthRequest, res: Response) => {
  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(
      `SELECT
         l.ID_LOG,
         d.NOMBRE AS NOMBRE_DEPARTAMENTO,
         u.NOMBRE AS NOMBRE_USUARIO,
         TO_CHAR(l.FECHA_CONEXION - INTERVAL '5' HOUR, 'YYYY-MM-DD"T"HH24:MI:SS') AS FECHA_CONEXION
       FROM HD_ANYDESK_LOG l
       JOIN HD_ANYDESK_DEPARTAMENTOS a ON a.ID_ANYDESK = l.ID_ANYDESK
       JOIN HD_DEPARTAMENTOS d         ON d.ID_DEPARTAMENTO = a.ID_DEPARTAMENTO
       JOIN HD_USUARIOS u              ON u.ID_USUARIO = l.ID_USUARIO
       ORDER BY l.FECHA_CONEXION DESC
       FETCH FIRST 100 ROWS ONLY`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.status(200).json(result.rows ?? []);
  } catch (error: any) {
    console.error('Error al obtener historial AnyDesk:', error.message);
    return res.status(500).json({ error: 'Error al obtener el historial de conexiones' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── PUT /anydesk/:id ─────────────────────────────────────────────────────────
export const updateAnydesk = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  const parsed = UpdateAnydeskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const idAdmin = (req.user as any)?.idUsuario;
  const { codigo_anydesk, password_anydesk } = parsed.data;

  let connection;
  try {
    connection = await oracledb.getConnection();
    const upd = await connection.execute(
      `UPDATE HD_ANYDESK_DEPARTAMENTOS
          SET CODIGO_ANYDESK      = :codigo,
              PASSWORD_ANYDESK    = :password,
              ACTUALIZADO_POR     = :admin,
              FECHA_ACTUALIZACION = SYSTIMESTAMP
        WHERE ID_ANYDESK = :id`,
      { codigo: codigo_anydesk, password: password_anydesk ?? null, admin: idAdmin, id },
      { autoCommit: true }
    );
    if (upd.rowsAffected === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    cache.invalidate(CACHE_KEY);
    return res.status(200).json({ mensaje: 'Código AnyDesk actualizado' });
  } catch (error: any) {
    console.error('Error al actualizar AnyDesk:', error.message);
    return res.status(500).json({ error: 'Error al actualizar el código AnyDesk' });
  } finally {
    if (connection) await connection.close();
  }
};
