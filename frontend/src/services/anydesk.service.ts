import api from './api';

export interface AnydeskEntry {
  ID_ANYDESK:           number;
  ID_DEPARTAMENTO:      number;
  NOMBRE_DEPARTAMENTO:  string;
  CODIGO_ANYDESK:       string | null;
  PASSWORD_ANYDESK:     string | null;
  ACTUALIZADO_POR:      string | null;
  FECHA_ACTUALIZACION:  string | null;
}

export interface AnydeskLogEntry {
  ID_LOG:              number;
  NOMBRE_DEPARTAMENTO: string;
  NOMBRE_USUARIO:      string;
  FECHA_CONEXION:      string;
}

export const anydeskService = {
  getAll: async (): Promise<AnydeskEntry[]> => {
    const response = await api.get('/anydesk');
    return response.data;
  },

  update: async (id: number, codigo_anydesk: string | null, password_anydesk?: string | null) => {
    const response = await api.put(`/anydesk/${id}`, { codigo_anydesk, password_anydesk });
    return response.data;
  },

  logConnection: async (id: number) => {
    const response = await api.post(`/anydesk/${id}/log`);
    return response.data;
  },

  getLogs: async (): Promise<AnydeskLogEntry[]> => {
    const response = await api.get('/anydesk/logs');
    return response.data;
  },
};
