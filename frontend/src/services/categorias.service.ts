import api from './api';

export interface Categoria {
  ID_CATEGORIA: number;
  NOMBRE: string;
  DESCRIPCION: string | null;
}

export const categoriasService = {
  getAll: async (): Promise<Categoria[]> => {
    const response = await api.get('/categorias');
    return response.data;
  },
};
