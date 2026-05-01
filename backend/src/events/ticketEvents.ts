// Patrón de eventos — desacopla la lógica de negocio de los efectos secundarios
// (historial, invalidación de caché, notificaciones futuras).
import { EventEmitter } from 'events';

export interface TicketCreatedEvent {
  idTicket: number;
  idUsuario: number;
  codigoTicket: string;
}

export interface TicketStatusChangedEvent {
  idTicket: number;
  idUsuario: number;
  estadoAnterior: string;
  estadoNuevo: string;
}

export interface TicketCommentedEvent {
  idTicket: number;
  idUsuario: number;
  detalle: string;
}

export const ticketEmitter = new EventEmitter();
ticketEmitter.setMaxListeners(20);
