import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import api from "@/src/services/api";

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const res = await api.post('/auth/login', {
          email: credentials?.email,
          password: credentials?.password
        });

        if (res.data && res.data.token) {
          return {
            id: res.data.usuario.id,
            name: res.data.usuario.nombre,
            email: res.data.usuario.email,
            rol: res.data.usuario.rol,
            accessToken: res.data.token
          };
        }
        return null;
      }
    })
  ],
  // ... tus callbacks y demás config ...
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.rol         = (user as any).rol;
        token.name        = (user as any).name;
        token.accessToken = (user as any).accessToken;
        token.idUsuario   = (user as any).id;   // guardamos el ID numérico
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).rol       = token.rol;
        (session.user as any).nombre    = token.name;
        (session.user as any).idUsuario = token.idUsuario;  // expuesto al frontend
        (session as any).accessToken    = token.accessToken;
      }
      return session;
    }
  }
});

// ESTO ES LO IMPORTANTE: Exportar explícitamente los métodos
export { handler as GET, handler as POST };