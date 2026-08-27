import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Building2,
  Warehouse,
  ShoppingCart,
  PlusCircle,
  Receipt,
  FileText,
  BarChart3,
  Package,
  Truck,
  Wallet,
  Inbox,
  History,
  Menu,
} from 'lucide-react';
import { getAuthSession } from '@/lib/session';
import { SignOutButton } from '@/components/sign-out-button';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';

const DESKTOP_NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/orders/new', label: 'Input Order', icon: PlusCircle },
  { href: '/admin/orders', label: 'Data Order', icon: ShoppingCart },
  { href: '/admin/packing', label: 'Packing List', icon: Truck },
  { href: '/admin/requests', label: 'Requests', icon: Inbox },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/books', label: 'Books', icon: BookOpen },
  { href: '/admin/suppliers', label: 'Suppliers', icon: Warehouse },
  { href: '/admin/publishers', label: 'Publishers', icon: Building2 },
  { href: '/admin/po-batches', label: 'PO Batches', icon: Package },
  { href: '/admin/payments', label: 'Payments', icon: Receipt },
  { href: '/admin/expenses', label: 'Expenses', icon: Wallet },
  { href: '/admin/invoices', label: 'Invoices', icon: FileText },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { href: '/admin/audit-log', label: 'Audit Log', icon: History },
];

// Mobile bottom nav: only the 4 screens used every day. Everything else
// lives behind "More" so this bar never gets crowded or hard to tap.
const MOBILE_NAV_ITEMS = [
  { href: '/admin/orders/new', label: 'Order', icon: PlusCircle },
  { href: '/admin/orders', label: 'Data', icon: ShoppingCart },
  { href: '/admin/packing', label: 'Packing', icon: Truck },
  { href: '/admin/more', label: 'More', icon: Menu },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthSession();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-border px-6">
          <Logo className="max-w-[140px]" />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {DESKTOP_NAV_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>
        <div className="border-t border-border p-4">
          <p className="mb-2 truncate text-sm font-medium">{session?.user?.name}</p>
          <p className="mb-3 text-xs text-muted-foreground">{session?.user?.role}</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/account">Account</Link>
            </Button>
            <SignOutButton />
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <Logo className="max-w-[110px]" />
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/account">Account</Link>
          </Button>
          <SignOutButton />
        </div>
      </div>

      <main className="flex-1 overflow-x-hidden pb-20 pt-14 md:pb-0 md:pt-0">{children}</main>

      {/* Mobile bottom nav — fixed, big touch targets */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-card md:hidden">
        {MOBILE_NAV_ITEMS.map((item) => (
          <BottomNavLink key={item.href} {...item} />
        ))}
      </nav>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground hover:bg-secondary"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

function BottomNavLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-foreground active:bg-secondary"
    >
      <Icon className="h-6 w-6" />
      <span className="text-[11px] font-medium">{label}</span>
    </Link>
  );
}
