import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/** Use in Server Components / route handlers to read the current session. */
export function getAuthSession() {
  return getServerSession(authOptions);
}
