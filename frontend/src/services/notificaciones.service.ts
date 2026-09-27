import api from './api';

export const notificacionesService = {
  getAll: async () => {
    const res = await api.get('/notificaciones');
    return res.data as { notificaciones: Notificacion[]; noLeidas: number };
  },

  marcarLeida: async (idNotif: number) => {
    await api.put(`/notificaciones/${idNotif}/leer`);
  },

  marcarTodasLeidas: async () => {
    await api.put('/notificaciones/leer-todas');
  },
};

export interface Notificacion {
  ID_NOTIF:       number;
  TITULO:         string;
  MENSAJE:        string;
  TIPO:           string;
  ID_TICKET:      number | null;
  LEIDA:          number;
  FECHA_CREACION: string;
}
