import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET no está configurado. El servidor no puede iniciar de forma segura.');
}

export type Rol = 'ADMIN' | 'TECNICO' | 'USUARIO' | 'PASANTE';

export interface UserPayload {
  idUsuario: number;
  nombre: string;
  email: string;
  rol: Rol;
  iat?: number;
  exp?: number;
}

// 2. Extendemos la interfaz de Express correctamente
export interface AuthRequest extends Request {
  user?: UserPayload; 
}

// Middleware 1: Verificar el Token
export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Acceso denegado. No se proporcionó token.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET as string;

  try {
    // Verificamos y casteamos el contenido al tipo UserPayload
    const decoded = jwt.verify(token, secret) as UserPayload;
    
    // Inyectamos el payload en la petición
    req.user = decoded;
    next(); 
  } catch (error) {
    res.status(403).json({ error: 'Token inválido o expirado' });
  }
};

// Middleware 2: Control de Acceso (RBAC)
export const authorize = (...rolesPermitidos: Rol[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
      res.status(403).json({
        error: `Acceso prohibido. Se requiere rol: ${rolesPermitidos.join(' o ')}`,
      });
      return;
    }
    next();
  };
};