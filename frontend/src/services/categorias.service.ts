import api from './api';

export interface Categoria {
  ID_CATEGORIA: number;
  NOMBRE:       string;
  DESCRIPCION:  string | null;
  ESTADO:       'ACTIVO' | 'INACTIVO';
}

export const categoriasService = {
  getAll: async (): Promise<Categoria[]> => {
    const response = await api.get('/categorias');
    return response.data;
  },

  crear: async (data: { nombre: string; descripcion?: string | null }) => {
    const response = await api.post('/categorias', data);
    return response.data;
  },

  editar: async (id: number, data: { nombre: string; descripcion?: string | null }) => {
    const response = await api.put(`/categorias/${id}`, data);
    return response.data;
  },

  toggle: async (id: number) => {
    const response = await api.put(`/categorias/${id}/toggle`);
    return response.data;
  },
};
