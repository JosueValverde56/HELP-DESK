import { Response } from 'express';
import bcrypt from 'bcrypt';
import oracledb from 'oracledb';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { notificarBienvenida } from '../services/notificaciones.service.js';

const CreateUsuarioSchema = z.object({
  nombre:          z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  email:           z.string().email('Email inválido'),
  password:        z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  rol:             z.enum(['ADMIN', 'TECNICO', 'USUARIO', 'PASANTE']),
  estado:          z.enum(['ACTIVO', 'PENDIENTE']).default('ACTIVO'),
  telefono:        z.string().max(20).optional().nullable(),
  notif_email:     z.number().int().min(0).max(1).default(1),
  notif_whatsapp:  z.number().int().min(0).max(1).default(0),
  id_departamento: z.number().int().positive().optional().nullable(),
});

const EditUsuarioSchema = z.object({
  nombre:          z.string().min(2).max(100).optional(),
  email:           z.string().email('Email inválido').optional(),
  rol:             z.enum(['ADMIN', 'TECNICO', 'USUARIO', 'PASANTE']).optional(),
  estado:          z.enum(['ACTIVO', 'PENDIENTE', 'INACTIVO']).optional(),
  telefono:        z.string().max(20).optional().nullable(),
  notif_email:     z.number().int().min(0).max(1).optional(),
  notif_whatsapp:  z.number().int().min(0).max(1).optional(),
  id_departamento: z.number().int().positive().optional().nullable(),
});

const ResetPasswordSchema = z.object({
  nueva_password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

function adminId(req: AuthRequest): number {
  return (req.user as any)?.idUsuario ?? 0;
}

// ── POST /usuarios/crear ───────────────────────────────────────────────────────
export const crearUsuario = async (req: AuthRequest, res: Response) => {
  const parsed = CreateUsuarioSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { nombre, email, password, rol, estado, telefono, notif_email, notif_whatsapp, id_departamento } = parsed.data;
  const estadoFinal = rol === 'PASANTE' && estado === 'ACTIVO' ? 'PENDIENTE' : estado;

  let connection;
  try {
    connection = await oracledb.getConnection();

    const checkEmail = await connection.execute(
      `SELECT ID_USUARIO FROM HD_USUARIOS WHERE EMAIL = :email`,
      { email },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((checkEmail.rows ?? []).length > 0) {
      return res.status(400).json({ error: 'El correo electrónico ya está registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await connection.execute(
      `INSERT INTO HD_USUARIOS
         (NOMBRE, EMAIL, PASSWORD_HASH, ROL, ESTADO, TELEFONO, NOTIF_EMAIL, NOTIF_WHATSAPP, ID_DEPARTAMENTO)
       VALUES
         (:nombre, :email, :password, :rol, :estado, :telefono, :notif_email, :notif_whatsapp, :id_departamento)`,
      { nombre, email, password: hashedPassword, rol, estado: estadoFinal,
        telefono: telefono ?? null, notif_email, notif_whatsapp,
        id_departamento: id_departamento ?? null },
      { autoCommit: true }
    );

    // Enviar credenciales por email — fire and forget
    notificarBienvenida({
      nombre,
      email,
      passwordPlano: password,
      rol,
      notifEmail: notif_email,
    }).catch(() => {});

    return res.status(201).json({
      mensaje: rol === 'PASANTE'
        ? 'Pasante registrado. Estado: PENDIENTE de aprobación.'
        : 'Usuario creado exitosamente',
    });

  } catch (error: any) {
    console.error('Error al crear usuario:', error.message);
    return res.status(500).json({ error: 'Error interno al crear el usuario' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── GET /usuarios ─────────────────────────────────────────────────────────────
export const getUsuarios = async (_req: AuthRequest, res: Response) => {
  let connection;
  try {
    connection = await oracledb.getConnection();

    const result = await connection.execute(
      `SELECT
         u.ID_USUARIO,
         u.NOMBRE,
         u.EMAIL,
         u.ROL,
         u.ESTADO,
         u.TELEFONO,
         u.NOTIF_EMAIL,
         u.NOTIF_WHATSAPP,
         u.ID_DEPARTAMENTO,
         d.NOMBRE AS NOMBRE_DEPARTAMENTO,
         TO_CHAR(u.FECHA_CREACION - INTERVAL '5' HOUR, 'YYYY-MM-DD"T"HH24:MI:SS') AS FECHA_CREACION
       FROM HD_USUARIOS u
       LEFT JOIN HD_DEPARTAMENTOS d ON d.ID_DEPARTAMENTO = u.ID_DEPARTAMENTO
       ORDER BY u.FECHA_CREACION DESC`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return res.status(200).json(result.rows ?? []);
  } catch (error: any) {
    console.error('Error al listar usuarios:', error.message);
    return res.status(500).json({ error: 'Error al obtener la lista de usuarios' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── PUT /usuarios/:id/aprobar ─────────────────────────────────────────────────
export const aprobarPasante = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  let connection;
  try {
    connection = await oracledb.getConnection();

    const result = await connection.execute(
      `UPDATE HD_USUARIOS
       SET ESTADO = 'ACTIVO'
       WHERE ID_USUARIO = :id AND ROL = 'PASANTE' AND ESTADO = 'PENDIENTE'`,
      { id },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Pasante no encontrado o ya está aprobado' });
    }

    return res.status(200).json({ mensaje: 'Pasante aprobado. Ya puede ingresar al sistema.' });

  } catch (error: any) {
    console.error('Error al aprobar pasante:', error.message);
    return res.status(500).json({ error: 'Error al aprobar el pasante' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── PUT /usuarios/:id — Editar datos (ADMIN only) ─────────────────────────────
export const editarUsuario = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  const parsed = EditUsuarioSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { nombre, email, rol, estado, telefono, notif_email, notif_whatsapp, id_departamento } = parsed.data;
  if (!nombre && !email && !rol && !estado && telefono === undefined && notif_email === undefined && notif_whatsapp === undefined && id_departamento === undefined) {
    return res.status(400).json({ error: 'No se enviaron campos a actualizar' });
  }

  // Proteger: no puede quitarse a sí mismo el rol ADMIN
  if (id === adminId(req) && rol && rol !== 'ADMIN') {
    return res.status(400).json({ error: 'No puedes cambiar tu propio rol de administrador' });
  }

  let connection;
  try {
    connection = await oracledb.getConnection();

    const existing = await connection.execute(
      `SELECT ID_USUARIO FROM HD_USUARIOS WHERE ID_USUARIO = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((existing.rows ?? []).length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (email) {
      const emailCheck = await connection.execute(
        `SELECT ID_USUARIO FROM HD_USUARIOS WHERE EMAIL = :email AND ID_USUARIO != :id`,
        { email, id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if ((emailCheck.rows ?? []).length > 0) {
        return res.status(400).json({ error: 'El email ya está en uso por otro usuario' });
      }
    }

    const setClauses: string[] = [];
    const binds: any = { id };
    if (nombre)             { setClauses.push('NOMBRE          = :nombre');         binds.nombre         = nombre; }
    if (email)              { setClauses.push('EMAIL           = :email');           binds.email          = email; }
    if (rol)                { setClauses.push('ROL             = :rol');             binds.rol            = rol; }
    if (estado)             { setClauses.push('ESTADO          = :estado');          binds.estado         = estado; }
    if (telefono !== undefined) { setClauses.push('TELEFONO    = :telefono');        binds.telefono       = telefono; }
    if (notif_email !== undefined)      { setClauses.push('NOTIF_EMAIL      = :ne');  binds.ne  = notif_email; }
    if (notif_whatsapp !== undefined)   { setClauses.push('NOTIF_WHATSAPP   = :nw');  binds.nw  = notif_whatsapp; }
    if (id_departamento !== undefined)  { setClauses.push('ID_DEPARTAMENTO  = :dep'); binds.dep = id_departamento ?? null; }

    await connection.execute(
      `UPDATE HD_USUARIOS SET ${setClauses.join(', ')} WHERE ID_USUARIO = :id`,
      binds,
      { autoCommit: true }
    );

    return res.status(200).json({ mensaje: 'Usuario actualizado exitosamente' });

  } catch (error: any) {
    console.error('Error al editar usuario:', error.message);
    return res.status(500).json({ error: 'Error al actualizar el usuario' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── PUT /usuarios/:id/reset-password — Forzar nueva contraseña (ADMIN only) ───
export const resetPasswordUsuario = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  const parsed = ResetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  let connection;
  try {
    connection = await oracledb.getConnection();

    const exists = await connection.execute(
      `SELECT ID_USUARIO FROM HD_USUARIOS WHERE ID_USUARIO = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((exists.rows ?? []).length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const hash = await bcrypt.hash(parsed.data.nueva_password, 10);

    await connection.execute(
      `UPDATE HD_USUARIOS SET PASSWORD_HASH = :hash WHERE ID_USUARIO = :id`,
      { hash, id },
      { autoCommit: true }
    );

    return res.status(200).json({ mensaje: 'Contraseña restablecida exitosamente' });

  } catch (error: any) {
    console.error('Error al resetear contraseña:', error.message);
    return res.status(500).json({ error: 'Error al restablecer la contraseña' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── DELETE /usuarios/:id — Eliminar usuario (ADMIN only) ─────────────────────
export const eliminarUsuario = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  if (id === adminId(req)) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  }

  let connection;
  try {
    connection = await oracledb.getConnection();

    const result = await connection.execute(
      `DELETE FROM HD_USUARIOS WHERE ID_USUARIO = :id`,
      { id },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    return res.status(200).json({ mensaje: 'Usuario eliminado exitosamente' });

  } catch (error: any) {
    console.error('Error al eliminar usuario:', error.message);
    if (error.errorNum === 2292) {
      return res.status(400).json({ error: 'No se puede eliminar: el usuario tiene tickets o historial asociado. Desactívalo en su lugar.' });
    }
    return res.status(500).json({ error: 'Error al eliminar el usuario' });
  } finally {
    if (connection) await connection.close();
  }
};
