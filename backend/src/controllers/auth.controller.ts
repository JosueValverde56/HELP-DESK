import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import oracledb from 'oracledb';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware.js';

const LoginSchema = z.object({
  email:    z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

export const login = async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const { email, password } = parsed.data;
  let connection;

  try {
    connection = await oracledb.getConnection();

    const result = await connection.execute(
      `SELECT ID_USUARIO, EMAIL, PASSWORD_HASH, NOMBRE, ROL, ESTADO
       FROM HD_USUARIOS WHERE EMAIL = :email`,
      { email },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const user: any = result.rows?.[0];

    if (!user) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    if (user.ESTADO === 'PENDIENTE') {
      res.status(403).json({ error: 'Tu cuenta está pendiente de aprobación. Contacta al administrador.' });
      return;
    }

    if (user.ESTADO !== 'ACTIVO') {
      res.status(403).json({ error: 'Cuenta inactiva. Contacta al administrador.' });
      return;
    }

    const passwordValida = await bcrypt.compare(password, user.PASSWORD_HASH);
    if (!passwordValida) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET no configurado');

    const token = jwt.sign(
      { idUsuario: user.ID_USUARIO, email: user.EMAIL, rol: user.ROL },
      secret,
      { expiresIn: '8h' }
    );

    res.json({
      mensaje: 'Login exitoso',
      token,
      usuario: {
        id:     user.ID_USUARIO,
        nombre: user.NOMBRE,
        email:  user.EMAIL,
        rol:    user.ROL,
      },
    });

  } catch (error: any) {
    console.error('Error en login:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── PUT /api/usuarios/cambiar-password ────────────────────────────────────────
const CambiarPasswordSchema = z.object({
  password_actual: z.string().min(1),
  password_nuevo:  z.string()
    .min(8,  'Mínimo 8 caracteres')
    .regex(/[A-Z]/,   'Debe contener al menos una mayúscula')
    .regex(/[0-9]/,   'Debe contener al menos un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial'),
});

export const cambiarPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = CambiarPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const { password_actual, password_nuevo } = parsed.data;
  const idUsuario = (req.user as any)?.idUsuario;
  if (!idUsuario) { res.status(401).json({ error: 'Sesión inválida' }); return; }

  let connection;
  try {
    connection = await oracledb.getConnection();

    const result = await connection.execute(
      `SELECT PASSWORD_HASH FROM HD_USUARIOS WHERE ID_USUARIO = :id`,
      { id: idUsuario },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const user: any = result.rows?.[0];
    if (!user) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }

    const valida = await bcrypt.compare(password_actual, user.PASSWORD_HASH);
    if (!valida) { res.status(400).json({ error: 'La contraseña actual es incorrecta' }); return; }

    const nuevoHash = await bcrypt.hash(password_nuevo, 10);
    await connection.execute(
      `UPDATE HD_USUARIOS SET PASSWORD_HASH = :hash WHERE ID_USUARIO = :id`,
      { hash: nuevoHash, id: idUsuario },
      { autoCommit: true }
    );

    res.json({ mensaje: 'Contraseña actualizada exitosamente' });

  } catch (error: any) {
    console.error('Error al cambiar contraseña:', error.message);
    res.status(500).json({ error: 'Error al cambiar la contraseña' });
  } finally {
    if (connection) await connection.close();
  }
};
