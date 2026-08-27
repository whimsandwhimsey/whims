import Link from 'next/link';
import {
  Users,
  BookOpen,
  Building2,
  Warehouse,
  Package,
  Receipt,
  Wallet,
  FileText,
  BarChart3,
  Inbox,
  History,
  Settings,
} from 'lucide-react';

const MORE_ITEMS = [
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/books', label: 'Books', icon: BookOpen },
  { href: '/admin/suppliers', label: 'Suppliers', icon: Warehouse },
  { href: '/admin/publishers', label: 'Publishers', icon: Building2 },
  { href: '/admin/po-batches', label: 'PO Batches', icon: Package },
  { href: '/admin/payments', label: 'Payments', icon: Receipt },
  { href: '/admin/expenses', label: 'Expenses', icon: Wallet },
  { href: '/admin/invoices', label: 'All invoices', icon: FileText },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { href: '/admin/requests', label: 'Requests', icon: Inbox },
  { href: '/admin/audit-log', label: 'Audit log', icon: History },
  { href: '/admin/account', label: 'Account', icon: Settings },
];

export default function MorePage() {
  return (
    <div className="p-4 pb-24 md:p-6">
      <h1 className="font-display mb-4 text-2xl font-semibold text-primary">More</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {MORE_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-4 text-center text-sm font-medium text-foreground shadow-sm transition hover:bg-secondary active:scale-[0.98]"
          >
            <Icon className="h-6 w-6 text-muted-foreground" />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
