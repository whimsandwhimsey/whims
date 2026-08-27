import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      accountType: 'STAFF' | 'CUSTOMER';
      role: 'ADMIN' | 'STAFF' | null;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    accountType: 'STAFF' | 'CUSTOMER';
    role: 'ADMIN' | 'STAFF' | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    accountType: 'STAFF' | 'CUSTOMER';
    role: 'ADMIN' | 'STAFF' | null;
  }
}
