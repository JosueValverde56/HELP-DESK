import { Response } from 'express';
import oracledb from 'oracledb';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { cache } from '../cache/appCache.js';

const CACHE_KEY = 'sla_config';

const UpdateSLAConfigSchema = z.object({
  configs: z.array(z.object({
    prioridad:    z.enum(['ALTA', 'MEDIA', 'BAJA']),
    horas_limite: z.number().positive().max(8760),
  })).min(1),
});

// ── GET /sla-config ───────────────────────────────────────────────────────────
export const getSLAConfig = async (_req: AuthRequest, res: Response) => {
  const cached = cache.get(CACHE_KEY);
  if (cached) return res.status(200).json(cached);

  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(
      `SELECT
         s.ID_SLA_CONFIG, s.PRIORIDAD, s.HORAS_LIMITE,
         u.NOMBRE AS ACTUALIZADO_POR,
         TO_CHAR(s.FECHA_ACT - INTERVAL '5' HOUR, 'YYYY-MM-DD"T"HH24:MI:SS') AS FECHA_ACT
       FROM HD_SLA_CONFIG s
       LEFT JOIN HD_USUARIOS u ON u.ID_USUARIO = s.ACTUALIZADO_POR
       ORDER BY CASE s.PRIORIDAD WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    cache.set(CACHE_KEY, result.rows ?? [], 300);
    return res.status(200).json(result.rows ?? []);
  } catch (error: any) {
    console.error('Error al obtener config SLA:', error.message);
    return res.status(500).json({ error: 'Error al obtener la configuración de SLA' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── PUT /sla-config ───────────────────────────────────────────────────────────
export const updateSLAConfig = async (req: AuthRequest, res: Response) => {
  const parsed = UpdateSLAConfigSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const idAdmin = (req.user as any)?.idUsuario;
  const { configs } = parsed.data;

  let connection;
  try {
    connection = await oracledb.getConnection();
    for (const { prioridad, horas_limite } of configs) {
      await connection.execute(
        `UPDATE HD_SLA_CONFIG
            SET HORAS_LIMITE = :horas, ACTUALIZADO_POR = :admin, FECHA_ACT = SYSTIMESTAMP
          WHERE PRIORIDAD = :prio`,
        { horas: horas_limite, admin: idAdmin, prio: prioridad },
        { autoCommit: true }
      );
    }
    cache.invalidate(CACHE_KEY);
    return res.status(200).json({ mensaje: 'Configuración de SLA actualizada' });
  } catch (error: any) {
    console.error('Error al actualizar config SLA:', error.message);
    return res.status(500).json({ error: 'Error al actualizar la configuración de SLA' });
  } finally {
    if (connection) await connection.close();
  }
};
