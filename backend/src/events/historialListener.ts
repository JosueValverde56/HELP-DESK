import oracledb from 'oracledb';
import {
  ticketEmitter,
  TicketCreatedEvent,
  TicketStatusChangedEvent,
  TicketCommentedEvent,
} from './ticketEvents.js';
import { cache } from '../cache/appCache.js';
import {
  notificarTicketCreado,
  notificarCambioEstado,
  notificarComentario,
  notificarAsignacion,
} from '../services/notificaciones.service.js';
import {
  notifInterna_TicketCreado,
  notifInterna_EstadoCambiado,
  notifInterna_Asignado,
  notifInterna_Comentario,
} from '../services/notifInterna.service.js';

async function insertHistorial(params: {
  idTicket:       number;
  idUsuario:      number;
  accion:         string;
  estadoAnterior?: string | null;
  estadoNuevo?:   string | null;
  detalle?:       string | null;
}): Promise<void> {
  let connection;
  try {
    connection = await oracledb.getConnection();
    await connection.execute(
      `INSERT INTO HD_HISTORIAL_TICKETS
         (ID_TICKET, ID_USUARIO, ACCION, ESTADO_ANTERIOR, ESTADO_NUEVO, DETALLE)
       VALUES
         (:idTicket, :idUsuario, :accion, :estadoAnterior, :estadoNuevo, :detalle)`,
      {
        idTicket:       params.idTicket,
        idUsuario:      params.idUsuario,
        accion:         params.accion,
        estadoAnterior: params.estadoAnterior ?? null,
        estadoNuevo:    params.estadoNuevo    ?? null,
        detalle:        params.detalle ? params.detalle.substring(0, 500) : null,
      },
      { autoCommit: true }
    );
  } catch (err: any) {
    console.error('❌ Error al registrar historial:', err.message);
  } finally {
    if (connection) await connection.close();
  }
}

export function registerHistorialListeners(): void {

  ticketEmitter.on('ticket.created', (event: TicketCreatedEvent) => {
    insertHistorial({
      idTicket:    event.idTicket,
      idUsuario:   event.idUsuario,
      accion:      'CREADO',
      estadoNuevo: 'ABIERTO',
      detalle:     `Ticket ${event.codigoTicket} creado`,
    });
    cache.invalidate('stats:');
    cache.invalidate('reportes:');
    // Notificaciones — fire and forget
    notificarTicketCreado(event.idTicket).catch(err => console.error('❌ notificarTicketCreado:', err.message));
    notifInterna_TicketCreado(event.idTicket, event.codigoTicket).catch(err => console.error('❌ notifInterna_TicketCreado:', err.message));
  });

  ticketEmitter.on('ticket.status_changed', (event: TicketStatusChangedEvent) => {
    insertHistorial({
      idTicket:       event.idTicket,
      idUsuario:      event.idUsuario,
      accion:         'CAMBIO_ESTADO',
      estadoAnterior: event.estadoAnterior,
      estadoNuevo:    event.estadoNuevo,
      detalle:        `Estado: ${event.estadoAnterior} → ${event.estadoNuevo}`,
    });
    cache.invalidate('stats:');
    cache.invalidate('reportes:');

    // Notificar asignación de técnico o cambio de estado
    if (event.estadoAnterior === 'ASIGNACION') {
      const idTecnico = Number(event.estadoNuevo?.replace('ASIGNADO:', ''));
      if (!isNaN(idTecnico) && idTecnico > 0) {
        notificarAsignacion(event.idTicket, idTecnico).catch(err => console.error('❌ notificarAsignacion:', err.message));
        notifInterna_Asignado(event.idTicket, idTecnico).catch(err => console.error('❌ notifInterna_Asignado:', err.message));
      }
    } else {
      console.log(`📧 Enviando notificación de estado: ${event.estadoAnterior} → ${event.estadoNuevo} (ticket #${event.idTicket})`);
      notificarCambioEstado(event.idTicket, event.estadoAnterior, event.estadoNuevo).catch(err => console.error('❌ notificarCambioEstado:', err.message));
      notifInterna_EstadoCambiado(event.idTicket, event.estadoNuevo).catch(err => console.error('❌ notifInterna_EstadoCambiado:', err.message));
    }
  });

  ticketEmitter.on('ticket.commented', (event: TicketCommentedEvent) => {
    insertHistorial({
      idTicket:  event.idTicket,
      idUsuario: event.idUsuario,
      accion:    'COMENTARIO',
      detalle:   event.detalle,
    });
    notificarComentario(event.idTicket, event.idUsuario).catch(err => console.error('❌ notificarComentario:', err.message));
    notifInterna_Comentario(event.idTicket, event.idUsuario).catch(err => console.error('❌ notifInterna_Comentario:', err.message));
  });

  console.log('✅ Listeners de historial y notificaciones registrados');
}
