import { Response } from 'express';
import oracledb from 'oracledb';
import path from 'path';
import fs from 'fs';
import { AuthRequest } from '../middleware/auth.middleware.js';

function getUserId(req: AuthRequest): number | null {
  const u = req.user as any;
  return u?.idUsuario ?? u?.id ?? null;
}

// ── POST /api/tickets/:id/adjuntos ────────────────────────────────────────────
export const subirAdjunto = async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

  const idTicket  = Number(req.params.id);
  const idUsuario = getUserId(req);
  if (!idUsuario) return res.status(401).json({ error: 'Sesión inválida' });

  let connection;
  try {
    connection = await oracledb.getConnection();

    // Verify ticket exists and user has access
    const ticket = await connection.execute(
      `SELECT ID_TICKET, ID_USUARIO FROM HD_TICKETS WHERE ID_TICKET = :id`,
      { id: idTicket },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (!(ticket.rows as any[]).length) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    const result = await connection.execute(
      `INSERT INTO HD_ADJUNTOS (ID_TICKET, ID_USUARIO, NOMBRE_ORIGINAL, RUTA_DISCO, MIME_TYPE, TAMANIO)
       VALUES (:id_ticket, :id_usuario, :nombre, :ruta, :mime, :tam)
       RETURNING ID_ADJUNTO INTO :id_adj`,
      {
        id_ticket: idTicket,
        id_usuario: idUsuario,
        nombre: req.file.originalname,
        ruta: req.file.path,
        mime: req.file.mimetype,
        tam: req.file.size,
        id_adj: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );

    const idAdj = (result.outBinds as any)?.id_adj?.[0];
    return res.status(201).json({ mensaje: 'Archivo subido exitosamente', id: idAdj, nombre: req.file.originalname });

  } catch (error: any) {
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error('Error al subir adjunto:', error.message);
    return res.status(500).json({ error: 'Error al guardar el archivo' });
  } finally {
    if (connection) await connection.close();
  }
};

// ── GET /api/adjuntos/:id ─────────────────────────────────────────────────────
export const descargarAdjunto = async (req: AuthRequest, res: Response) => {
  const idAdj = Number(req.params.id);
  if (!idAdj || isNaN(idAdj)) return res.status(400).json({ error: 'ID inválido' });

  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(
      `SELECT RUTA_DISCO, NOMBRE_ORIGINAL, MIME_TYPE FROM HD_ADJUNTOS WHERE ID_ADJUNTO = :id`,
      { id: idAdj },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = (result.rows as any[])?.[0];
    if (!row) return res.status(404).json({ error: 'Adjunto no encontrado' });

    if (!fs.existsSync(row.RUTA_DISCO)) return res.status(404).json({ error: 'Archivo no encontrado en disco' });

    res.setHeader('Content-Type', row.MIME_TYPE || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.NOMBRE_ORIGINAL)}"`);
    fs.createReadStream(row.RUTA_DISCO).pipe(res);

  } catch (error: any) {
    console.error('Error al descargar adjunto:', error.message);
    return res.status(500).json({ error: 'Error al descargar el archivo' });
  } finally {
    if (connection) await connection.close();
  }
};
