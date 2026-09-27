import { Response } from 'express';
import oracledb from 'oracledb';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { cache } from '../cache/appCache.js';

const GYE = `- INTERVAL '5' HOUR`;

/** Ejecuta una query en su propia conexión del pool y la libera al terminar */
async function q(sql: string, binds: Record<string, any> = {}): Promise<any[]> {
  const conn = await oracledb.getConnection();
  try {
    const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return (result.rows as any[]) ?? [];
  } finally {
    await conn.close();
  }
}

/** Igual que q() pero devuelve [] si falla, para no tumbar Promise.all */
async function qSafe(sql: string, binds: Record<string, any> = {}): Promise<any[]> {
  try {
    return await q(sql, binds);
  } catch (err: any) {
    console.error('⚠️  Query reportes falló (omitida):', err.message?.slice(0, 120));
    return [];
  }
}

// ── GET /reportes  ─────────────────────────────────────────────────────────────
export const getReporteGeneral = async (req: AuthRequest, res: Response) => {
  const desde = req.query.desde as string | undefined;
  const hasta = req.query.hasta as string | undefined;

  const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (desde && !ISO_DATE.test(desde)) return res.status(400).json({ error: 'Formato "desde" inválido (YYYY-MM-DD)' });
  if (hasta && !ISO_DATE.test(hasta)) return res.status(400).json({ error: 'Formato "hasta" inválido (YYYY-MM-DD)' });

  const cacheKey = `reportes:general:${desde ?? '*'}:${hasta ?? '*'}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json(cached);

  try {
    // CAST(FECHA_CREACION AS DATE) convierte el TIMESTAMP a DATE antes de comparar,
    // evitando conversiones implícitas problemáticas en Oracle 21c.
    const binds: Record<string, string> = {};
    let where = '';
    if (desde) { where += ` AND CAST(FECHA_CREACION AS DATE) >= TO_DATE(:desde,'YYYY-MM-DD')`; binds.desde = desde; }
    if (hasta) { where += ` AND CAST(FECHA_CREACION AS DATE) <= TO_DATE(:hasta,'YYYY-MM-DD')`; binds.hasta = hasta; }

    const bindsT: Record<string, string> = { ...binds };
    let whereT = '';
    if (desde) { whereT += ` AND CAST(t.FECHA_CREACION AS DATE) >= TO_DATE(:desde,'YYYY-MM-DD')`; }
    if (hasta) { whereT += ` AND CAST(t.FECHA_CREACION AS DATE) <= TO_DATE(:hasta,'YYYY-MM-DD')`; }

    // 11 queries en paralelo, cada una con su propia conexión del pool
    const [
      rowsTotal, rowsEstado, rowsPrioridad, rowsCategoria, rowsFecha,
      rowsTecnico, rowsSLA, rowsRespuesta, rowsResolucion, rowsCsat, rowsDepartamento,
    ] = await Promise.all([

      qSafe(`SELECT COUNT(*) AS TOTAL FROM HD_TICKETS WHERE 1=1 ${where}`, binds),

      qSafe(`SELECT NVL(ESTADO,'ABIERTO') AS ESTADO, COUNT(*) AS TOTAL
         FROM HD_TICKETS WHERE 1=1 ${where}
         GROUP BY NVL(ESTADO,'ABIERTO') ORDER BY TOTAL DESC`, binds),

      qSafe(`SELECT PRIORIDAD, COUNT(*) AS TOTAL
         FROM HD_TICKETS WHERE 1=1 ${where}
         GROUP BY PRIORIDAD ORDER BY TOTAL DESC`, binds),

      qSafe(`SELECT c.NOMBRE AS CATEGORIA, COUNT(t.ID_TICKET) AS TOTAL
         FROM HD_CATEGORIAS c
         LEFT JOIN HD_TICKETS t ON c.ID_CATEGORIA = t.ID_CATEGORIA ${whereT ? 'AND 1=1' + whereT : ''}
         GROUP BY c.NOMBRE ORDER BY TOTAL DESC`, bindsT),

      qSafe(`SELECT TO_CHAR(FECHA_CREACION ${GYE},'YYYY-MM-DD') AS DIA, COUNT(*) AS TOTAL
         FROM HD_TICKETS
         WHERE FECHA_CREACION >= SYSDATE - 90
         GROUP BY TO_CHAR(FECHA_CREACION ${GYE},'YYYY-MM-DD')
         ORDER BY DIA ASC`),

      qSafe(`SELECT u.NOMBRE AS TECNICO, COUNT(h.ID_HISTORIAL) AS RESUELTOS
         FROM HD_USUARIOS u
         LEFT JOIN HD_HISTORIAL_TICKETS h
           ON u.ID_USUARIO = h.ID_USUARIO
          AND h.ACCION = 'CAMBIO_ESTADO' AND h.ESTADO_NUEVO = 'RESUELTO'
         WHERE u.ROL IN ('TECNICO','ADMIN','PASANTE')
         GROUP BY u.NOMBRE ORDER BY RESUELTOS DESC`),

      qSafe(`SELECT COUNT(*) AS TOTAL_CERRADOS,
           SUM(CASE WHEN h.FECHA IS NULL OR h.FECHA <= t.FECHA_SLA THEN 1 ELSE 0 END) AS CUMPLIDOS,
           ROUND(SUM(CASE WHEN h.FECHA IS NULL OR h.FECHA <= t.FECHA_SLA THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*),0), 1) AS PORCENTAJE_CUMPLIMIENTO
         FROM HD_TICKETS t
         LEFT JOIN (
           SELECT ID_TICKET, MIN(FECHA) AS FECHA
           FROM HD_HISTORIAL_TICKETS
           WHERE ACCION = 'CAMBIO_ESTADO' AND ESTADO_NUEVO IN ('RESUELTO','CERRADO')
           GROUP BY ID_TICKET
         ) h ON h.ID_TICKET = t.ID_TICKET
         WHERE t.ESTADO IN ('RESUELTO','CERRADO') AND t.FECHA_SLA IS NOT NULL ${whereT}`, bindsT),

      qSafe(`SELECT ROUND(AVG((CAST(c.PRIMER_COM AS DATE) - CAST(t.FECHA_CREACION AS DATE)) * 24), 2) AS HORAS_PROMEDIO_RESPUESTA
         FROM HD_TICKETS t
         JOIN (
           SELECT ID_TICKET, MIN(FECHA_CREACION) AS PRIMER_COM
           FROM HD_COMENTARIOS WHERE ES_INTERNO = 0 GROUP BY ID_TICKET
         ) c ON c.ID_TICKET = t.ID_TICKET
         WHERE t.ESTADO IN ('RESUELTO','CERRADO') ${whereT}`, bindsT),

      qSafe(`SELECT ROUND(AVG((CAST(h.FECHA AS DATE) - CAST(t.FECHA_CREACION AS DATE)) * 24), 2) AS HORAS_PROMEDIO_RESOLUCION
         FROM HD_TICKETS t
         JOIN HD_HISTORIAL_TICKETS h ON h.ID_TICKET = t.ID_TICKET
           AND h.ACCION = 'CAMBIO_ESTADO' AND h.ESTADO_NUEVO = 'RESUELTO'
         WHERE t.ESTADO IN ('RESUELTO','CERRADO') ${whereT}`, bindsT),

      qSafe(`SELECT ROUND(AVG(CALIFICACION),2) AS PROMEDIO_CSAT,
           COUNT(CALIFICACION) AS TOTAL_CALIFICACIONES,
           MIN(CALIFICACION)   AS MIN_CSAT,
           MAX(CALIFICACION)   AS MAX_CSAT
         FROM HD_TICKETS WHERE CALIFICACION IS NOT NULL ${where}`, binds),

      qSafe(`SELECT d.NOMBRE AS DEPARTAMENTO, COUNT(t.ID_TICKET) AS TOTAL
         FROM HD_DEPARTAMENTOS d
         LEFT JOIN HD_USUARIOS u ON u.ID_DEPARTAMENTO = d.ID_DEPARTAMENTO
         LEFT JOIN HD_TICKETS  t ON t.ID_USUARIO = u.ID_USUARIO ${whereT ? 'AND 1=1' + whereT : ''}
         WHERE d.ESTADO = 'ACTIVO'
         GROUP BY d.NOMBRE ORDER BY TOTAL DESC`, bindsT),
    ]);

    const slaRow   = rowsSLA[0]         ?? {};
    const respRow  = rowsRespuesta[0]   ?? {};
    const resolRow = rowsResolucion[0]  ?? {};
    const csatRow  = rowsCsat[0]        ?? {};

    const totalResueltos = Number(slaRow.TOTAL_CERRADOS ?? 0);
    const totalTickets   = Number(rowsTotal[0]?.TOTAL   ?? 0);

    const data = {
      totalTickets,
      porEstado:       rowsEstado,
      porPrioridad:    rowsPrioridad,
      porCategoria:    rowsCategoria,
      porFecha:        rowsFecha,
      porTecnico:      rowsTecnico,
      porDepartamento: rowsDepartamento,
      sla: {
        totalCerrados:          totalResueltos,
        cumplidos:              Number(slaRow.CUMPLIDOS               ?? 0),
        porcentajeCumplimiento: Number(slaRow.PORCENTAJE_CUMPLIMIENTO ?? 0),
      },
      tiempoPromedioRespuesta:  Number(respRow.HORAS_PROMEDIO_RESPUESTA   ?? 0),
      tiempoPromedioResolucion: Number(resolRow.HORAS_PROMEDIO_RESOLUCION ?? 0),
      csat: {
        promedio: Number(csatRow.PROMEDIO_CSAT        ?? 0),
        total:    Number(csatRow.TOTAL_CALIFICACIONES ?? 0),
        min:      Number(csatRow.MIN_CSAT             ?? 0),
        max:      Number(csatRow.MAX_CSAT             ?? 0),
      },
      tasaResolucion: totalTickets > 0
        ? Math.round((totalResueltos / totalTickets) * 1000) / 10
        : 0,
      generadoEn: new Date().toISOString(),
      filtros:    { desde: desde ?? null, hasta: hasta ?? null },
    };

    cache.set(cacheKey, data, 60);
    return res.status(200).json(data);

  } catch (error: any) {
    console.error('🚨 Error en reporte general:', error.message);
    return res.status(500).json({ error: 'Error al generar el reporte', detalle: error.message });
  }
};
