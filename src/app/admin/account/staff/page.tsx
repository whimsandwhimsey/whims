import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getAuthSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { NewStaffForm } from './new-staff-form';
import { StaffRow } from './staff-row';

export default async function StaffAccountsPage() {
  const session = await getAuthSession();
  if (!session || session.user.accountType !== 'STAFF' || session.user.role !== 'ADMIN') {
    redirect('/admin/dashboard');
  }

  const staff = await prisma.user.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });

  return (
    <div className="p-4 pb-24 sm:p-6">
      <Link
        href="/admin/account"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Account
      </Link>

      <h1 className="font-display mb-1 text-2xl font-semibold text-primary">Staff accounts</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Bikin login baru buat staff, reset password mereka, atau nonaktifin akun yang udah gak
        kepake. Cuma admin yang bisa buka halaman ini.
      </p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Tambah staff baru</CardTitle>
        </CardHeader>
        <CardContent>
          <NewStaffForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Semua akun ({staff.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {staff.map((u) => (
            <StaffRow
              key={u.id}
              user={{
                id: u.id,
                name: u.name,
                username: u.username,
                role: u.role,
                isActive: u.isActive,
                createdAtLabel: formatDate(u.createdAt),
              }}
              isSelf={u.id === session.user.id}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
