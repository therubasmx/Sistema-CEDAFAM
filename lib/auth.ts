import { type NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Position, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        // Freno a la fuerza bruta: 10 intentos por IP+correo cada 15 min.
        const ip =
          (req?.headers?.["x-forwarded-for"] as string | undefined)
            ?.split(",")[0]
            ?.trim() ?? "unknown";
        const email = credentials.email.toLowerCase();
        const limit = rateLimit(`login:${ip}:${email}`, 10, 15 * 60 * 1000);
        if (!limit.ok) {
          throw new Error("Demasiados intentos. Espera unos minutos.");
        }

        const user = await db.user.findUnique({
          where: { email },
          include: { psychologist: true },
        });
        if (!user || !user.isActive) return null;

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          psychologistId: user.psychologist?.id ?? null,
          position: user.position,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.psychologistId = user.psychologistId;
        token.position = user.position;
      }
      // Se relee el perfil en cada request: el puesto abre módulos en la barra
      // lateral, así que un cambio hecho por el admin debe surtir efecto sin
      // esperar a que la persona vuelva a entrar. Es una búsqueda por llave
      // primaria, y para los roles sin perfil de psicólogo esta consulta ya
      // ocurría antes en cada request.
      if (token.id) {
        const fresh = await db.user.findUnique({
          where: { id: token.id as string },
          select: { position: true, psychologist: { select: { id: true } } },
        });
        if (fresh) {
          token.position = fresh.position;
          token.psychologistId = fresh.psychologist?.id ?? null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.psychologistId = token.psychologistId as string | null;
        session.user.position = token.position as Position | null;
      }
      return session;
    },
  },
};

/** Convenience wrapper for reading the session in server contexts. */
export function auth() {
  return getServerSession(authOptions);
}
