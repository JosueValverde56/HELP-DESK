import api from './api';

export const historialService = {
  getByTicket: async (idTicket: number) => {
    const response = await api.get(`/tickets/${idTicket}/historial`);
    return response.data;
  },
};
