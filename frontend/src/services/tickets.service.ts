import api from './api';

export interface TicketsResponse {
  tickets: any[];
  totalItems: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const ticketsService = {
  getAll: async (params?: {
    page?: number;
    limit?: number;
    estado?: string;
    prioridad?: string;
    q?: string;
    desde?: string;
    hasta?: string;
    activos?: string;
  }): Promise<TicketsResponse> => {
    const response = await api.get('/tickets', { params });
    return response.data;
  },

  create: async (data: any) => {
    const response = await api.post('/tickets', data);
    return response.data;
  },

  updateStatus: async (id: number, estado: string) => {
    const response = await api.put(`/tickets/${id}/estado`, { estado });
    return response.data;
  },

  asignarTicket: async (id: number, id_tecnico: number | null) => {
    const response = await api.put(`/tickets/${id}/asignar`, { id_tecnico });
    return response.data;
  },

  addComment: async (data: { id_ticket: number; texto: string; nuevo_estado?: string; es_interno?: boolean }) => {
    const response = await api.post('/tickets/comentario', data);
    return response.data;
  },

  getComments: async (id_ticket: number) => {
    const response = await api.get(`/tickets/${id_ticket}/comentarios`);
    return response.data;
  },

  getStats: async () => {
    const response = await api.get('/tickets/stats');
    return response.data;
  },

  calificar: async (id_ticket: number, calificacion: number) => {
    const response = await api.put(`/tickets/${id_ticket}/calificar`, { calificacion });
    return response.data;
  },

  reabrir: async (id_ticket: number) => {
    const response = await api.put(`/tickets/${id_ticket}/reabrir`);
    return response.data;
  },

  getAdjuntos: async (id_ticket: number) => {
    const response = await api.get(`/tickets/${id_ticket}/adjuntos`);
    return response.data;
  },

  subirAdjunto: async (id_ticket: number, archivo: File) => {
    const form = new FormData();
    form.append('archivo', archivo);
    const response = await api.post(`/tickets/${id_ticket}/adjuntos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  updateSLA: async (id_ticket: number, fecha_sla: string) => {
    const response = await api.put(`/tickets/${id_ticket}/sla`, { fecha_sla });
    return response.data;
  },

  getAdjuntoUrl: (id_adjunto: number) => {
    return `/api/adjuntos/${id_adjunto}`;
  },

  getTrend: async (): Promise<{ DIA: string; TOTAL: number }[]> => {
    const response = await api.get('/tickets/trend');
    return response.data;
  },
};
