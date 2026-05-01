import api from './api';

export const usuariosService = {
  crearUsuario: async (userData: {
    nombre: string;
    email: string;
    password: string;
    rol: string;
    estado?: string;
  }) => {
    const response = await api.post('/usuarios/crear', userData);
    return response.data;
  },

  getAll: async () => {
    const response = await api.get('/usuarios');
    return response.data;
  },

  aprobarPasante: async (idUsuario: number) => {
    const response = await api.put(`/usuarios/${idUsuario}/aprobar`);
    return response.data;
  },

  editarUsuario: async (idUsuario: number, data: {
    nombre?: string;
    email?: string;
    rol?: string;
    estado?: string;
  }) => {
    const response = await api.put(`/usuarios/${idUsuario}`, data);
    return response.data;
  },

  resetPassword: async (idUsuario: number, nueva_password: string) => {
    const response = await api.put(`/usuarios/${idUsuario}/reset-password`, { nueva_password });
    return response.data;
  },

  eliminarUsuario: async (idUsuario: number) => {
    const response = await api.delete(`/usuarios/${idUsuario}`);
    return response.data;
  },

  cambiarPassword: async (data: {
    password_actual: string;
    password_nuevo: string;
  }) => {
    const response = await api.put('/usuarios/cambiar-password', data);
    return response.data;
  },

  getMePerfil: async () => {
    const response = await api.get('/me/perfil');
    return response.data;
  },

  updateMePerfil: async (data: {
    nombre?: string;
    telefono?: string | null;
    notif_email?: number;
    notif_whatsapp?: number;
  }) => {
    const response = await api.put('/me/perfil', data);
    return response.data;
  },

  getMeStats: async () => {
    const response = await api.get('/me/stats');
    return response.data;
  },

  testEmail: async () => {
    const response = await api.post('/test-email');
    return response.data;
  },

  testWhatsApp: async () => {
    const response = await api.post('/test-whatsapp');
    return response.data;
  },
};
