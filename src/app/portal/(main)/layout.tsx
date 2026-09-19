import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthSession } from '@/lib/session';

export default async function PortalMainLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthSession();
  const customerId = session!.user.id;

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { address: true },
  });

  if (!customer?.address) {
    redirect('/portal/profile/edit-address?required=1');
  }

  return <>{children}</>;
}
