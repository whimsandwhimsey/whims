import Link from 'next/link';
import { ArrowLeft, FileText, Receipt } from 'lucide-react';

const FINANCE_ITEMS = [
  { href: '/admin/invoices', label: 'Invoices', icon: FileText, description: 'Semua invoice yang udah di-issue' },
  { href: '/admin/payments', label: 'Payments', icon: Receipt, description: 'Riwayat pembayaran QRIS & transfer' },
];

export default function FinancePage() {
  return (
    <div className="p-4 pb-24 md:p-6">
      <Link
        href="/admin/more"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to More
      </Link>
      <h1 className="font-display mb-4 text-2xl font-semibold text-primary">Finance</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FINANCE_ITEMS.map(({ href, label, icon: Icon, description }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:bg-secondary active:scale-[0.98]"
          >
            <Icon className="h-6 w-6 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
