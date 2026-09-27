process.env.TZ = 'America/Guayaquil';

import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import oracledb from 'oracledb';
import path from 'path';
import { Server as SocketServer } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { initializeDB } from './db/connection.js';
import { login, cambiarPassword, forgotPassword, resetPassword } from './controllers/auth.controller.js';
import { authenticate, authorize } from './middleware/auth.middleware.js';
import { upload } from './middleware/upload.middleware.js';
import {
  getTickets, createTicket, updateTicketStatus,
  addComment, getCommentsByTicket, getTicketStats, getTicketTrend, asignarTicket, reabrirTicket,
  calificarTicket, getAdjuntos, updateSLA,
} from './controllers/tickets.controller.js';
import {
  crearUsuario, getUsuarios, aprobarPasante,
  editarUsuario, eliminarUsuario, resetPasswordUsuario,
} from './controllers/usuarios.controller.js';
import { getHistorialByTicket } from './controllers/historial.controller.js';
import { getReporteGeneral } from './controllers/reportes.controller.js';
import { getCategorias, crearCategoria, editarCategoria, toggleCategoria } from './controllers/categorias.controller.js';
import { getAnydesk, updateAnydesk, registrarConexionAnydesk, getAnydeskLogs } from './controllers/anydesk.controller.js';
import { getSLAConfig, updateSLAConfig } from './controllers/sla.controller.js';
import {
  getDepartamentos, crearDepartamento, editarDepartamento, toggleDepartamento,
} from './controllers/departamentos.controller.js';
import { registerHistorialListeners } from './events/historialListener.js';
import { getMePerfil, updateMePerfil, getMeStats } from './controllers/perfil.controller.js';
import { startSLAMonitor } from './jobs/slaMonitor.js';
import { subirAdjunto, descargarAdjunto } from './controllers/adjuntos.controller.js';
import { ticketEmitter } from './events/ticketEvents.js';
import { verificarConexionEmail } from './services/notificaciones.service.js';
import { getNotificaciones, marcarLeida, marcarTodasLeidas } from './controllers/notificaciones.controller.js';
import { setIo } from './socket/socketInstance.js';

dotenv.config();

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 4000;

// ── WebSocket (socket.io) ─────────────────────────────────────────────────────
const ALLOWED_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:3000';

export const io = new SocketServer(server, {
  cors: {
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  socket.on('join_ticket', (idTicket: number) => socket.join(`ticket:${idTicket}`));
  socket.on('leave_ticket', (idTicket: number) => socket.leave(`ticket:${idTicket}`));
  socket.on('join_user',   (idUsuario: number) => socket.join(`user:${idUsuario}`));
});

setIo(io);

// Bridge domain events → WebSocket rooms
ticketEmitter.on('ticket.created', (data) => {
  io.emit('ticket:created', data);
});
ticketEmitter.on('ticket.status_changed', (data) => {
  io.to(`ticket:${data.idTicket}`).emit('ticket:updated', data);
  io.emit('ticket:list_refresh');
});
ticketEmitter.on('ticket.commented', (data) => {
  io.to(`ticket:${data.idTicket}`).emit('ticket:comment', data);
});

// ── Swagger ───────────────────────────────────────────────────────────────────
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Helpdesk API',
      version: '1.0.0',
      description: 'API REST del sistema Helpdesk universitario',
    },
    servers: [{ url: `http://localhost:${PORT}` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/index.ts'],
});

// ── Seguridad HTTP ────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: ALLOWED_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

// Serve uploaded files statically (for inline preview)
app.use('/uploads', authenticate as any, express.static(path.resolve('uploads')));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Demasiados intentos de inicio de sesión. Espera 15 minutos.' },
  skipSuccessfulRequests: true,
});

// ── Swagger UI ────────────────────────────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', zona: 'America/Guayaquil', timestamp: new Date() });
});

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', loginLimiter, login);

// ── Perfil / Mi cuenta ────────────────────────────────────────────────────────
app.get('/api/me',         authenticate, (req: any, res) => res.json({ user: req.user }));
app.get('/api/me/perfil',  authenticate, getMePerfil);
app.put('/api/me/perfil',  authenticate, updateMePerfil);
app.get('/api/me/stats',   authenticate, getMeStats);

// ── Auth extra (forgot / reset password) ────────────────────────────────────
app.post('/api/auth/forgot-password', forgotPassword);
app.post('/api/auth/reset-password',  resetPassword);

// ── Categorías ────────────────────────────────────────────────────────────────
app.get ('/api/categorias',                 authenticate,                    getCategorias);
app.post('/api/categorias',                 authenticate, authorize('ADMIN'), crearCategoria);
app.put ('/api/categorias/:id',             authenticate, authorize('ADMIN'), editarCategoria);
app.put ('/api/categorias/:id/toggle',      authenticate, authorize('ADMIN'), toggleCategoria);

// ── AnyDesk ───────────────────────────────────────────────────────────────────
app.get ('/api/anydesk',          authenticate,                    getAnydesk);
app.put ('/api/anydesk/:id',      authenticate, authorize('ADMIN'), updateAnydesk);
app.post('/api/anydesk/:id/log',  authenticate,                    registrarConexionAnydesk);
app.get ('/api/anydesk/logs',     authenticate, authorize('ADMIN'), getAnydeskLogs);

// ── Configuración SLA ─────────────────────────────────────────────────────────
app.get('/api/sla-config',  authenticate,                    getSLAConfig);
app.put('/api/sla-config',  authenticate, authorize('ADMIN'), updateSLAConfig);

// ── Departamentos ─────────────────────────────────────────────────────────────
app.get   ('/api/departamentos',               authenticate,                    getDepartamentos);
app.post  ('/api/departamentos',               authenticate, authorize('ADMIN'), crearDepartamento);
app.put   ('/api/departamentos/:id',           authenticate, authorize('ADMIN'), editarDepartamento);
app.put   ('/api/departamentos/:id/toggle',    authenticate, authorize('ADMIN'), toggleDepartamento);

// ── Tickets ───────────────────────────────────────────────────────────────────
app.get ('/api/tickets',                  authenticate, getTickets);
app.post('/api/tickets',                  authenticate, createTicket);
app.get ('/api/tickets/stats',            authenticate, getTicketStats);
app.get ('/api/tickets/trend',            authenticate, getTicketTrend);
app.put ('/api/tickets/:id/estado',       authenticate, authorize('ADMIN', 'TECNICO'), updateTicketStatus);
app.put ('/api/tickets/:id/asignar',      authenticate, authorize('ADMIN', 'TECNICO'), asignarTicket);
app.put ('/api/tickets/:id/sla',          authenticate, authorize('ADMIN', 'TECNICO'), updateSLA);
app.put ('/api/tickets/:id/reabrir',      authenticate, reabrirTicket);
app.put ('/api/tickets/:id/calificar',    authenticate, calificarTicket);
app.post('/api/tickets/comentario',       authenticate, addComment);
app.get ('/api/tickets/:id/comentarios',  authenticate, getCommentsByTicket);
app.get ('/api/tickets/:id/historial',    authenticate, getHistorialByTicket);
app.post('/api/tickets/:id/adjuntos',     authenticate, upload.single('archivo'), subirAdjunto as any);
app.get ('/api/tickets/:id/adjuntos',     authenticate, getAdjuntos);

// ── Adjuntos (descarga) ───────────────────────────────────────────────────────
app.get('/api/adjuntos/:id', authenticate, descargarAdjunto);

// ── Reportes ──────────────────────────────────────────────────────────────────
app.get('/api/reportes', authenticate, authorize('ADMIN', 'TECNICO', 'PASANTE'), getReporteGeneral);

// ── Test email (solo ADMIN) ───────────────────────────────────────────────────
app.post('/api/test-email', authenticate, authorize('ADMIN'), async (req: any, res) => {
  const { enviarEmailPrueba } = await import('./services/notificaciones.service.js');
  try {
    await enviarEmailPrueba(req.user.email);
    res.json({ ok: true, mensaje: `Email de prueba enviado a ${req.user.email}` });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// ── Notificaciones internas ───────────────────────────────────────────────────
app.get('/api/notificaciones',           authenticate, getNotificaciones);
app.put('/api/notificaciones/leer-todas', authenticate, marcarTodasLeidas);
app.put('/api/notificaciones/:id/leer',  authenticate, marcarLeida);

// ── Usuarios ──────────────────────────────────────────────────────────────────
app.post  ('/api/usuarios/crear',               authenticate, authorize('ADMIN'), crearUsuario);
app.get   ('/api/usuarios',                     authenticate, authorize('ADMIN'), getUsuarios);
app.put   ('/api/usuarios/cambiar-password',    authenticate,                    cambiarPassword);
app.put   ('/api/usuarios/:id/aprobar',         authenticate, authorize('ADMIN'), aprobarPasante);
app.put   ('/api/usuarios/:id/reset-password',  authenticate, authorize('ADMIN'), resetPasswordUsuario);
app.put   ('/api/usuarios/:id',                 authenticate, authorize('ADMIN'), editarUsuario);
app.delete('/api/usuarios/:id',                 authenticate, authorize('ADMIN'), eliminarUsuario);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ error: `Ruta ${req.method} ${req.originalUrl} no encontrada` });
});

// ── Error handler ─────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error no controlado:', err?.message ?? err);
  res.status(err?.status ?? 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : (err?.message ?? 'Error desconocido'),
  });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  console.log(`\n🛑 Señal ${signal} recibida — cerrando servidor...`);
  try { await oracledb.getPool().close(10); } catch { /* pool might not exist */ }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── Arranque ──────────────────────────────────────────────────────────────────
async function startServer() {
  await initializeDB();
  registerHistorialListeners();
  startSLAMonitor();
  await verificarConexionEmail();

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ El puerto ${PORT} ya está en uso.`);
      console.error(`   Ejecuta este comando para liberar el puerto y vuelve a arrancar:`);
      console.error(`   npx kill-port ${PORT}\n`);
      process.exit(1);
    } else {
      throw err;
    }
  });

  server.listen(PORT, () => {
    console.log(`🚀 Backend corriendo en http://localhost:${PORT}`);
    console.log(`📚 Swagger UI en   http://localhost:${PORT}/api/docs`);
    console.log(`🌐 CORS permitido para: ${ALLOWED_ORIGIN}`);
    console.log(`🕐 Zona horaria: ${process.env.TZ}`);
  });
}

startServer();
