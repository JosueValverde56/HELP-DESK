import api from './api';

export interface SLAConfig {
  ID_SLA_CONFIG:   number;
  PRIORIDAD:       'ALTA' | 'MEDIA' | 'BAJA';
  HORAS_LIMITE:    number;
  ACTUALIZADO_POR: string | null;
  FECHA_ACT:       string;
}

export const slaService = {
  getConfig: async (): Promise<SLAConfig[]> => {
    const response = await api.get('/sla-config');
    return response.data;
  },

  updateConfig: async (configs: { prioridad: string; horas_limite: number }[]) => {
    const response = await api.put('/sla-config', { configs });
    return response.data;
  },
};
