// src/services/api.ts
import axios from 'axios';
import { getSession } from 'next-auth/react';

const api = axios.create({
  baseURL: 'http://localhost:4000/api',
});

api.interceptors.request.use(async (config) => {
  const session = await getSession();
  const token = (session as any)?.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}, (error) => Promise.reject(error));

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const msg    = error.response?.data?.error ?? '';
    // Solo redirigir al login si el token expiró o es inválido
    if (typeof window !== 'undefined') {
      if (status === 401 || (status === 403 && msg.includes('expirado'))) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;