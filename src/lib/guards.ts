import { getAuthSession } from '@/lib/session';

/** Use at the top of every admin server action. Throws (rather than
 * redirecting) since server actions can't redirect mid-mutation cleanly —
 * the caller/UI should never let a non-staff user reach this anyway, thanks
 * to middleware, but this is defense in depth. */
export async function requireStaffSession() {
  const session = await getAuthSession();
  if (!session || session.user.accountType !== 'STAFF') {
    throw new Error('Not authorized. Please sign in as staff.');
  }
  return session;
}

/** Use for anything that manages other staff accounts — only the store
 * owner (ADMIN role) should be able to create logins or reset passwords
 * for other staff. */
export async function requireAdminSession() {
  const session = await requireStaffSession();
  if (session.user.role !== 'ADMIN') {
    throw new Error('Only an admin can do this.');
  }
  return session;
}

export async function requireCustomerSession() {
  const session = await getAuthSession();
  if (!session || session.user.accountType !== 'CUSTOMER') {
    throw new Error('Not authorized. Please sign in with your phone number.');
  }
  return session;
}
