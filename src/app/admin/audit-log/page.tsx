import { prisma } from '@/lib/prisma';
import { Card } from '@/components/ui/card';
import { SearchBox } from '@/components/search-box';
import { Pagination } from '@/components/pagination';
import { formatDate } from '@/lib/utils';
import { AuditActionFilter } from './action-filter';

const PAGE_SIZE = 30;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; action?: string };
}) {
  const q = searchParams.q?.trim() ?? '';
  const action = searchParams.action ?? '';
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (q) {
    where.OR = [
      { entityType: { contains: q, mode: 'insensitive' as const } },
      { summary: { contains: q, mode: 'insensitive' as const } },
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-primary">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every meaningful change made in the system, {total} total.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <SearchBox placeholder="Search by entity type or summary…" />
        <div className="w-48">
          <AuditActionFilter />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Who</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Entity</th>
                <th className="px-4 py-3 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-secondary/50">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatDate(log.createdAt)}
                  </td>
                  <td className="px-4 py-3">{log.user?.name ?? 'System / Customer'}</td>
                  <td className="px-4 py-3">{log.action}</td>
                  <td className="px-4 py-3 text-muted-foreground">{log.entityType}</td>
                  <td className="px-4 py-3">{log.summary ?? '—'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No matching activity.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          buildHref={(p) =>
            `/admin/audit-log?${new URLSearchParams({ ...(q ? { q } : {}), ...(action ? { action } : {}), page: String(p) })}`
          }
        />
      </Card>
    </div>
  );
}
