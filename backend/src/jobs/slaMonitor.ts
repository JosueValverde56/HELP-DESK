import oracledb from 'oracledb';
import { notificarSLAVencido } from '../services/notificaciones.service.js';

const INTERVALO_MS = 60 * 60 * 1000; // cada hora

async function verificarSLA(): Promise<void> {
  let connection;
  try {
    connection = await oracledb.getConnection();

    // Buscar tickets con SLA vencido, activos, y que aún no recibieron alerta
    const result = await connection.execute(
      `SELECT ID_TICKET FROM HD_TICKETS
       WHERE FECHA_SLA IS NOT NULL
         AND FECHA_SLA < SYSTIMESTAMP
         AND ESTADO NOT IN ('RESUELTO','CERRADO')
         AND SLA_ALERTA_ENVIADA = 0`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const vencidos = (result.rows as any[]) ?? [];
    if (vencidos.length === 0) return;

    console.log(`⏰ SLA Monitor: ${vencidos.length} ticket(s) con SLA vencido — enviando alertas`);

    for (const row of vencidos) {
      const id: number = row.ID_TICKET;

      // Marcar como alertado primero para evitar doble envío si falla la notificación
      await connection.execute(
        `UPDATE HD_TICKETS SET SLA_ALERTA_ENVIADA = 1 WHERE ID_TICKET = :id`,
        { id },
        { autoCommit: true }
      );

      // Fire and forget — error no afecta al loop
      notificarSLAVencido(id).catch((err) =>
        console.error(`❌ Error notificación SLA ticket #${id}:`, err.message)
      );
    }
  } catch (err: any) {
    console.error('❌ SLA Monitor error:', err.message);
  } finally {
    if (connection) await connection.close();
  }
}

export function startSLAMonitor(): void {
  console.log('⏰ SLA Monitor iniciado — verificación cada hora');
  // Primera verificación al arrancar (con 10s de delay para que el pool esté listo)
  setTimeout(verificarSLA, 10_000);
  setInterval(verificarSLA, INTERVALO_MS);
}
