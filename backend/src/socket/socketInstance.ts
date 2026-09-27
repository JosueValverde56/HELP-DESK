import { Server as SocketServer } from 'socket.io';

let _io: SocketServer | null = null;

export function setIo(server: SocketServer): void {
  _io = server;
}

export function getIo(): SocketServer | null {
  return _io;
}
