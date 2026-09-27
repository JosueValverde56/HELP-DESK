import { Response } from 'express';
import oracledb from 'oracledb';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { cache } from '../cache/appCache.js';

const CACHE_KEY = 'categorias';

const CategoriaSchema = z.object({
  nombre:      z.string().min(2, 'Mínimo 2 caracteres').max(100),
  descripcion: z.string().max(300).optional().nullable(),
});

// ── GET /categorias ───────────────────────────────────────────────────────────
export const getCategorias = async (_req: AuthRequest, res: Response) => {
  const cached = cache.get<unknown[]>(CACHE_KEY);
  if (cached) return res.status(200).json(cached);

  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(
      `SELECT ID_CATEGORIA, NOMBRE, DESCRIPCION, ESTADO
       FROM HD_CATEGORIAS ORDER BY NOMBRE`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const rows = result.rows ?? [];
    cache.set(CACHE_KEY, rows, 300);
    return res.status(200).json(rows);
  } catch (error: any) {
    console.error('Error al obtener categorías:', error.message);
    return res.status(500).json({ error: 'Error al obtener las categorías' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── POST /categorias ──────────────────────────────────────────────────────────
export const crearCategoria = async (req: AuthRequest, res: Response) => {
  const parsed = CategoriaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { nombre, descripcion } = parsed.data;
  let connection;
  try {
    connection = await oracledb.getConnection();

    const dup = await connection.execute(
      `SELECT COUNT(*) AS CNT FROM HD_CATEGORIAS WHERE UPPER(NOMBRE) = UPPER(:nombre)`,
      { nombre }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((dup.rows as any[])[0].CNT > 0)
      return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });

    await connection.execute(
      `INSERT INTO HD_CATEGORIAS (NOMBRE, DESCRIPCION) VALUES (:nombre, :desc)`,
      { nombre, desc: descripcion ?? null },
      { autoCommit: true }
    );
    cache.invalidate(CACHE_KEY);
    return res.status(201).json({ mensaje: 'Categoría creada exitosamente' });
  } catch (error: any) {
    console.error('Error al crear categoría:', error.message);
    return res.status(500).json({ error: 'Error al crear la categoría' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── PUT /categorias/:id ───────────────────────────────────────────────────────
export const editarCategoria = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  const parsed = CategoriaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { nombre, descripcion } = parsed.data;
  let connection;
  try {
    connection = await oracledb.getConnection();

    const dup = await connection.execute(
      `SELECT COUNT(*) AS CNT FROM HD_CATEGORIAS WHERE UPPER(NOMBRE) = UPPER(:nombre) AND ID_CATEGORIA != :id`,
      { nombre, id }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((dup.rows as any[])[0].CNT > 0)
      return res.status(400).json({ error: 'Ya existe otra categoría con ese nombre' });

    const upd = await connection.execute(
      `UPDATE HD_CATEGORIAS SET NOMBRE = :nombre, DESCRIPCION = :desc WHERE ID_CATEGORIA = :id`,
      { nombre, desc: descripcion ?? null, id },
      { autoCommit: true }
    );
    if (upd.rowsAffected === 0) return res.status(404).json({ error: 'Categoría no encontrada' });
    cache.invalidate(CACHE_KEY);
    return res.status(200).json({ mensaje: 'Categoría actualizada exitosamente' });
  } catch (error: any) {
    console.error('Error al editar categoría:', error.message);
    return res.status(500).json({ error: 'Error al editar la categoría' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── PUT /categorias/:id/toggle ────────────────────────────────────────────────
export const toggleCategoria = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  let connection;
  try {
    connection = await oracledb.getConnection();
    const current = await connection.execute(
      `SELECT ESTADO FROM HD_CATEGORIAS WHERE ID_CATEGORIA = :id`,
      { id }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = (current.rows as any[])?.[0];
    if (!row) return res.status(404).json({ error: 'Categoría no encontrada' });

    const nuevoEstado = row.ESTADO === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    await connection.execute(
      `UPDATE HD_CATEGORIAS SET ESTADO = :estado WHERE ID_CATEGORIA = :id`,
      { estado: nuevoEstado, id }, { autoCommit: true }
    );
    cache.invalidate(CACHE_KEY);
    return res.status(200).json({ mensaje: `Categoría ${nuevoEstado === 'ACTIVO' ? 'activada' : 'desactivada'}` });
  } catch (error: any) {
    console.error('Error al cambiar estado de categoría:', error.message);
    return res.status(500).json({ error: 'Error al cambiar estado' });
  } finally {
    if (connection) await connection.close();
  }
};
