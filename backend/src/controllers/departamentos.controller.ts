import { Response } from 'express';
import oracledb from 'oracledb';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { cache } from '../cache/appCache.js';

const CACHE_KEY = 'departamentos';

const DepartamentoSchema = z.object({
  nombre:      z.string().min(2, 'Mínimo 2 caracteres').max(150),
  descripcion: z.string().max(300).optional().nullable(),
});

// ── GET /departamentos ────────────────────────────────────────────────────────
export const getDepartamentos = async (_req: AuthRequest, res: Response) => {
  const cached = cache.get<unknown[]>(CACHE_KEY);
  if (cached) return res.status(200).json(cached);

  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(
      `SELECT
         ID_DEPARTAMENTO,
         NOMBRE,
         DESCRIPCION,
         ESTADO,
         TO_CHAR(FECHA_CREACION - INTERVAL '5' HOUR, 'YYYY-MM-DD"T"HH24:MI:SS') AS FECHA_CREACION
       FROM HD_DEPARTAMENTOS
       ORDER BY NOMBRE`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const rows = result.rows ?? [];
    cache.set(CACHE_KEY, rows, 120);
    return res.status(200).json(rows);
  } catch (error: any) {
    console.error('Error al obtener departamentos:', error.message);
    return res.status(500).json({ error: 'Error al obtener los departamentos' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── POST /departamentos ───────────────────────────────────────────────────────
export const crearDepartamento = async (req: AuthRequest, res: Response) => {
  const parsed = DepartamentoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { nombre, descripcion } = parsed.data;

  let connection;
  try {
    connection = await oracledb.getConnection();

    const dup = await connection.execute(
      `SELECT ID_DEPARTAMENTO FROM HD_DEPARTAMENTOS WHERE UPPER(NOMBRE) = UPPER(:nombre)`,
      { nombre },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((dup.rows ?? []).length > 0) {
      return res.status(400).json({ error: 'Ya existe un departamento con ese nombre' });
    }

    await connection.execute(
      `INSERT INTO HD_DEPARTAMENTOS (NOMBRE, DESCRIPCION) VALUES (:nombre, :descripcion)`,
      { nombre, descripcion: descripcion ?? null },
      { autoCommit: true }
    );

    cache.invalidate(CACHE_KEY);
    return res.status(201).json({ mensaje: 'Departamento creado exitosamente' });
  } catch (error: any) {
    console.error('Error al crear departamento:', error.message);
    return res.status(500).json({ error: 'Error al crear el departamento' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── PUT /departamentos/:id ────────────────────────────────────────────────────
export const editarDepartamento = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  const parsed = DepartamentoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { nombre, descripcion } = parsed.data;

  let connection;
  try {
    connection = await oracledb.getConnection();

    const exists = await connection.execute(
      `SELECT ID_DEPARTAMENTO FROM HD_DEPARTAMENTOS WHERE ID_DEPARTAMENTO = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((exists.rows ?? []).length === 0) return res.status(404).json({ error: 'Departamento no encontrado' });

    const dup = await connection.execute(
      `SELECT ID_DEPARTAMENTO FROM HD_DEPARTAMENTOS
       WHERE UPPER(NOMBRE) = UPPER(:nombre) AND ID_DEPARTAMENTO != :id`,
      { nombre, id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((dup.rows ?? []).length > 0) {
      return res.status(400).json({ error: 'Ya existe otro departamento con ese nombre' });
    }

    await connection.execute(
      `UPDATE HD_DEPARTAMENTOS
       SET NOMBRE = :nombre, DESCRIPCION = :descripcion
       WHERE ID_DEPARTAMENTO = :id`,
      { nombre, descripcion: descripcion ?? null, id },
      { autoCommit: true }
    );

    cache.invalidate(CACHE_KEY);
    return res.status(200).json({ mensaje: 'Departamento actualizado exitosamente' });
  } catch (error: any) {
    console.error('Error al editar departamento:', error.message);
    return res.status(500).json({ error: 'Error al actualizar el departamento' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── PUT /departamentos/:id/toggle ─────────────────────────────────────────────
export const toggleDepartamento = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  let connection;
  try {
    connection = await oracledb.getConnection();

    const row = await connection.execute(
      `SELECT ESTADO FROM HD_DEPARTAMENTOS WHERE ID_DEPARTAMENTO = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((row.rows ?? []).length === 0) return res.status(404).json({ error: 'Departamento no encontrado' });

    const estadoActual = (row.rows as any[])[0].ESTADO as string;
    const nuevoEstado  = estadoActual === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';

    await connection.execute(
      `UPDATE HD_DEPARTAMENTOS SET ESTADO = :estado WHERE ID_DEPARTAMENTO = :id`,
      { estado: nuevoEstado, id },
      { autoCommit: true }
    );

    cache.invalidate(CACHE_KEY);
    return res.status(200).json({
      mensaje: `Departamento ${nuevoEstado === 'ACTIVO' ? 'habilitado' : 'deshabilitado'} exitosamente`,
      estado:  nuevoEstado,
    });
  } catch (error: any) {
    console.error('Error al cambiar estado de departamento:', error.message);
    return res.status(500).json({ error: 'Error al cambiar el estado del departamento' });
  } finally {
    if (connection) await connection.close();
  }
};
