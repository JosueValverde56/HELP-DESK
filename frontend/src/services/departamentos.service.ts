import api from './api';

export interface Departamento {
  ID_DEPARTAMENTO: number;
  NOMBRE:          string;
  DESCRIPCION:     string | null;
  ESTADO:          'ACTIVO' | 'INACTIVO';
  FECHA_CREACION:  string;
}

export const departamentosService = {
  getAll: async (): Promise<Departamento[]> => {
    const response = await api.get('/departamentos');
    return response.data;
  },

  crear: async (data: { nombre: string; descripcion?: string | null }) => {
    const response = await api.post('/departamentos', data);
    return response.data;
  },

  editar: async (id: number, data: { nombre: string; descripcion?: string | null }) => {
    const response = await api.put(`/departamentos/${id}`, data);
    return response.data;
  },

  toggle: async (id: number) => {
    const response = await api.put(`/departamentos/${id}/toggle`);
    return response.data;
  },
};
