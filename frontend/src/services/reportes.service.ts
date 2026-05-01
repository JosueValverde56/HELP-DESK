import api from './api';

export const reportesService = {
  getGeneral: async (desde?: string, hasta?: string) => {
    const params: Record<string, string> = {};
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;
    const response = await api.get('/reportes', { params });
    return response.data;
  },
};
