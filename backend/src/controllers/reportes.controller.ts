import { Response } from 'express';
import oracledb from 'oracledb';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { cache } from '../cache/appCache.js';

// Guayaquil = UTC-5
const GYE_OFFSET = `- INTERVAL '5' HOUR`;

export const getReporteGeneral = async (req: AuthRequest, res: Response) => {
  const desde = req.query.desde as string | undefined;
  const hasta = req.query.hasta as string | undefined;

  const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (desde && !ISO_DATE.test(desde)) return res.status(400).json({ error: 'Formato de fecha "desde" inválido (YYYY-MM-DD)' });
  if (hasta && !ISO_DATE.test(hasta)) return res.status(400).json({ error: 'Formato de fecha "hasta" inválido (YYYY-MM-DD)' });
  if (desde && hasta && desde > hasta) return res.status(400).json({ error: '"desde" no puede ser posterior a "hasta"' });

  const cacheKey = `reportes:general:${desde ?? '*'}:${hasta ?? '*'}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json(cached);

  let connection;
  try {
    connection = await oracledb.getConnection();

    // Construir filtro de fechas reutilizable
    const binds: Record<string, string> = {};
    let whereDate = '';
    if (desde) { whereDate += ` AND TRUNC(FECHA_CREACION ${GYE_OFFSET}) >= TO_DATE(:desde,'YYYY-MM-DD')`; binds.desde = desde; }
    if (hasta) { whereDate += ` AND TRUNC(FECHA_CREACION ${GYE_OFFSET}) <= TO_DATE(:hasta,'YYYY-MM-DD')`; binds.hasta = hasta; }

    const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };

    // ── Consultas en paralelo ─────────────────────────────────────────────────
    const [rEstado, rPrioridad, rCategoria, rFecha, rTecnico, rTotal] =
      await Promise.all([
        // Por estado
        connection.execute(
          `SELECT NVL(ESTADO,'ABIERTO') AS ESTADO, COUNT(*) AS TOTAL
           FROM HD_TICKETS WHERE 1=1 ${whereDate}
           GROUP BY NVL(ESTADO,'ABIERTO') ORDER BY TOTAL DESC`,
          binds, opts
        ),
        // Por prioridad
        connection.execute(
          `SELECT PRIORIDAD, COUNT(*) AS TOTAL
           FROM HD_TICKETS WHERE 1=1 ${whereDate}
           GROUP BY PRIORIDAD ORDER BY TOTAL DESC`,
          binds, opts
        ),
        // Por categoría
        connection.execute(
          `SELECT c.NOMBRE AS CATEGORIA, COUNT(t.ID_TICKET) AS TOTAL
           FROM HD_CATEGORIAS c
           LEFT JOIN HD_TICKETS t
             ON c.ID_CATEGORIA = t.ID_CATEGORIA ${whereDate ? 'AND 1=1' + whereDate : ''}
           GROUP BY c.NOMBRE ORDER BY TOTAL DESC`,
          binds, opts
        ),
        // Por día (últimos 30 días o rango dado)
        connection.execute(
          `SELECT TO_CHAR(FECHA_CREACION ${GYE_OFFSET},'YYYY-MM-DD') AS DIA,
                  COUNT(*) AS TOTAL
           FROM HD_TICKETS
           WHERE FECHA_CREACION ${GYE_OFFSET} >= SYSDATE - 30 ${whereDate}
           GROUP BY TO_CHAR(FECHA_CREACION ${GYE_OFFSET},'YYYY-MM-DD')
           ORDER BY DIA ASC`,
          binds, opts
        ),
        // Por técnico (tickets resueltos)
        connection.execute(
          `SELECT u.NOMBRE AS TECNICO, COUNT(h.ID_HISTORIAL) AS RESUELTOS
           FROM HD_USUARIOS u
           LEFT JOIN HD_HISTORIAL_TICKETS h
             ON u.ID_USUARIO = h.ID_USUARIO
            AND h.ACCION = 'CAMBIO_ESTADO'
            AND h.ESTADO_NUEVO = 'RESUELTO'
           WHERE u.ROL IN ('TECNICO','ADMIN','PASANTE')
           GROUP BY u.NOMBRE ORDER BY RESUELTOS DESC`,
          {}, opts
        ),
        // Total general
        connection.execute(
          `SELECT COUNT(*) AS TOTAL FROM HD_TICKETS WHERE 1=1 ${whereDate}`,
          binds, opts
        ),
      ]);

    const data = {
      totalTickets:  (rTotal.rows as any[])?.[0]?.TOTAL ?? 0,
      porEstado:     rEstado.rows    ?? [],
      porPrioridad:  rPrioridad.rows ?? [],
      porCategoria:  rCategoria.rows ?? [],
      porFecha:      rFecha.rows     ?? [],
      porTecnico:    rTecnico.rows   ?? [],
      generadoEn:    new Date().toISOString(),
      filtros:       { desde: desde ?? null, hasta: hasta ?? null },
    };

    cache.set(cacheKey, data, 60); // 60 s
    return res.status(200).json(data);

  } catch (error: any) {
    console.error('🚨 Error en reporte general:', error.message);
    return res.status(500).json({ error: 'Error al generar el reporte', detalle: error.message });
  } finally {
    if (connection) await connection.close();
  }
};
