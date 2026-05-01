import { Response } from 'express';
import oracledb from 'oracledb';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { cache } from '../cache/appCache.js';

export const getCategorias = async (_req: AuthRequest, res: Response) => {
  const cached = cache.get<unknown[]>('categorias');
  if (cached) return res.status(200).json(cached);

  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(
      `SELECT ID_CATEGORIA, NOMBRE, DESCRIPCION
       FROM HD_CATEGORIAS ORDER BY NOMBRE`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const rows = result.rows ?? [];
    cache.set('categorias', rows, 300); // 5 min — las categorías cambian poco
    return res.status(200).json(rows);
  } catch (error: any) {
    console.error('Error al obtener categorías:', error.message);
    return res.status(500).json({ error: 'Error al obtener las categorías' });
  } finally {
    if (connection) await connection.close();
  }
};
