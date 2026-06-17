import { type NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
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
      }
      // Re-fetch psychologistId if the profile was created after the last login.
      if (token.id && !token.psychologistId) {
        const psych = await db.psychologist.findUnique({
          where: { userId: token.id as string },
          select: { id: true },
        });
        if (psych) token.psychologistId = psych.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.psychologistId = token.psychologistId as string | null;
      }
      return session;
    },
  },
};

/** Convenience wrapper for reading the session in server contexts. */
export function auth() {
  return getServerSession(authOptions);
}
