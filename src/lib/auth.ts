import { type AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/utils';

/**
 * Two completely separate login flows share one NextAuth instance:
 *
 *  - "staff-login"    : username + password  -> Admin / Staff users table
 *  - "customer-login" : phone number only    -> Customer table
 *
 * The resulting session.user.accountType ("STAFF" | "CUSTOMER") is what
 * middleware.ts and every server action use to decide what someone can see.
 * This is a deliberate simplification for v1 (no OTP yet) — see README
 * "Security notes" for how to upgrade the customer flow to OTP later
 * without changing the session shape.
 */
export const authOptions: AuthOptions = {
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 }, // 7 days
  pages: {
    signIn: '/login/admin',
  },
  providers: [
    CredentialsProvider({
      id: 'staff-login',
      name: 'Staff Login',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { username: credentials.username.trim().toLowerCase() },
        });
        if (!user || !user.isActive) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          accountType: 'STAFF' as const,
          role: user.role,
        };
      },
    }),
    CredentialsProvider({
      id: 'customer-login',
      name: 'Customer Login',
      credentials: {
        phone: { label: 'Phone number', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.phone) return null;
        const phone = normalizePhone(credentials.phone);

        const customer = await prisma.customer.findUnique({ where: { phone } });
        if (!customer || customer.status !== 'ACTIVE') return null;

        return {
          id: customer.id,
          name: customer.name,
          accountType: 'CUSTOMER' as const,
          role: null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accountType = (user as any).accountType;
        token.role = (user as any).role ?? null;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.accountType = token.accountType as 'STAFF' | 'CUSTOMER';
        session.user.role = token.role as 'ADMIN' | 'STAFF' | null;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
