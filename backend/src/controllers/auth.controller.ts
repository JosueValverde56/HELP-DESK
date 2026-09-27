import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import oracledb from 'oracledb';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { sendMail } from '../services/notificaciones.service.js';

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

    if (!user) { res.status(401).json({ error: 'Credenciales inválidas' }); return; }
    if (user.ESTADO === 'PENDIENTE') {
      res.status(403).json({ error: 'Tu cuenta está pendiente de aprobación. Contacta al administrador.' }); return;
    }
    if (user.ESTADO !== 'ACTIVO') {
      res.status(403).json({ error: 'Cuenta inactiva. Contacta al administrador.' }); return;
    }

    const passwordValida = await bcrypt.compare(password, user.PASSWORD_HASH);
    if (!passwordValida) { res.status(401).json({ error: 'Credenciales inválidas' }); return; }

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
    .regex(/[A-Z]/,        'Debe contener al menos una mayúscula')
    .regex(/[0-9]/,        'Debe contener al menos un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial'),
});

export const cambiarPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = CambiarPasswordSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return; }

  const { password_actual, password_nuevo } = parsed.data;
  const idUsuario = (req.user as any)?.idUsuario;
  if (!idUsuario) { res.status(401).json({ error: 'Sesión inválida' }); return; }

  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(
      `SELECT PASSWORD_HASH FROM HD_USUARIOS WHERE ID_USUARIO = :id`,
      { id: idUsuario }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const user: any = result.rows?.[0];
    if (!user) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }

    const valida = await bcrypt.compare(password_actual, user.PASSWORD_HASH);
    if (!valida) { res.status(400).json({ error: 'La contraseña actual es incorrecta' }); return; }

    const nuevoHash = await bcrypt.hash(password_nuevo, 10);
    await connection.execute(
      `UPDATE HD_USUARIOS SET PASSWORD_HASH = :hash WHERE ID_USUARIO = :id`,
      { hash: nuevoHash, id: idUsuario }, { autoCommit: true }
    );
    res.json({ mensaje: 'Contraseña actualizada exitosamente' });

  } catch (error: any) {
    console.error('Error al cambiar contraseña:', error.message);
    res.status(500).json({ error: 'Error al cambiar la contraseña' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── POST /api/auth/forgot-password ────────────────────────────────────────────
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'Email requerido' }); return;
  }

  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(
      `SELECT ID_USUARIO, NOMBRE, ESTADO FROM HD_USUARIOS WHERE EMAIL = :email`,
      { email }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const user: any = result.rows?.[0];

    // Siempre responder OK para no revelar si el email existe
    if (!user || user.ESTADO !== 'ACTIVO') {
      res.json({ mensaje: 'Si el correo existe, recibirás el enlace en breve' }); return;
    }

    const token = crypto.randomBytes(48).toString('hex');
    const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
    const expiraOracle = expira.toISOString().replace('T', ' ').substring(0, 19);

    // Invalidar tokens anteriores del mismo usuario
    await connection.execute(
      `UPDATE HD_RESET_TOKENS SET USADO = 1 WHERE ID_USUARIO = :id AND USADO = 0`,
      { id: user.ID_USUARIO }, { autoCommit: true }
    );

    await connection.execute(
      `INSERT INTO HD_RESET_TOKENS (ID_USUARIO, TOKEN, EXPIRA_EN)
       VALUES (:id, :token, TO_TIMESTAMP(:expira, 'YYYY-MM-DD HH24:MI:SS'))`,
      { id: user.ID_USUARIO, token, expira: expiraOracle },
      { autoCommit: true }
    );

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    await sendMail({
      from:    `"Helpdesk GAD Pelileo" <${process.env.EMAIL_USER}>`,
      to:      email,
      subject: 'Restablecer contraseña — Helpdesk GAD Pelileo',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto">
          <h2 style="color:#1d4ed8">Restablecer contraseña</h2>
          <p>Hola <strong>${user.NOMBRE}</strong>,</p>
          <p>Recibimos una solicitud para restablecer tu contraseña. El enlace expira en <strong>1 hora</strong>.</p>
          <a href="${resetUrl}"
             style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#fff;
                    border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">
            Restablecer contraseña
          </a>
          <p style="color:#64748b;font-size:0.85rem">
            Si no solicitaste esto, ignora este mensaje. Tu contraseña no cambiará.
          </p>
        </div>`,
    });

    res.json({ mensaje: 'Si el correo existe, recibirás el enlace en breve' });

  } catch (error: any) {
    console.error('Error en forgot-password:', error.message);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
const ResetPasswordSchema = z.object({
  token:        z.string().min(1),
  nueva_password: z.string()
    .min(8,  'Mínimo 8 caracteres')
    .regex(/[A-Z]/,        'Debe contener al menos una mayúscula')
    .regex(/[0-9]/,        'Debe contener al menos un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial'),
});

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const parsed = ResetPasswordSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return; }

  const { token, nueva_password } = parsed.data;
  let connection;
  try {
    connection = await oracledb.getConnection();

    const result = await connection.execute(
      `SELECT r.ID_TOKEN, r.ID_USUARIO, r.EXPIRA_EN, r.USADO
       FROM HD_RESET_TOKENS r
       WHERE r.TOKEN = :token`,
      { token }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row: any = result.rows?.[0];

    if (!row) { res.status(400).json({ error: 'Token inválido o expirado' }); return; }
    if (row.USADO === 1) { res.status(400).json({ error: 'Este enlace ya fue utilizado' }); return; }
    if (new Date(row.EXPIRA_EN) < new Date()) {
      res.status(400).json({ error: 'El enlace ha expirado. Solicita uno nuevo.' }); return;
    }

    const hash = await bcrypt.hash(nueva_password, 10);
    await connection.execute(
      `UPDATE HD_USUARIOS SET PASSWORD_HASH = :hash WHERE ID_USUARIO = :id`,
      { hash, id: row.ID_USUARIO }, { autoCommit: true }
    );
    await connection.execute(
      `UPDATE HD_RESET_TOKENS SET USADO = 1 WHERE ID_TOKEN = :id`,
      { id: row.ID_TOKEN }, { autoCommit: true }
    );

    res.json({ mensaje: 'Contraseña restablecida exitosamente. Ya puedes iniciar sesión.' });

  } catch (error: any) {
    console.error('Error en reset-password:', error.message);
    res.status(500).json({ error: 'Error al restablecer la contraseña' });
  } finally {
    if (connection) await connection.close();
  }
};
