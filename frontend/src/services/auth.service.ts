// src/services/auth.service.ts
import { signIn, signOut } from "next-auth/react";

export const authService = {
  // Ahora el login usa NextAuth
  login: async (credentials: { email: string; password: string }) => {
    const result = await signIn("credentials", {
      email: credentials.email,
      password: credentials.password,
      redirect: false, // Para manejar la redirección nosotros mismos
    });
    return result;
  },

  // El logout limpia las cookies de NextAuth automáticamente
  logout: async () => {
    await signOut({ callbackUrl: "/login" });
  }
};