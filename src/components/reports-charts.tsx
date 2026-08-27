'use client';

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { MonthlyPoint } from '@/lib/reports';

const CURRENCY_FORMATTER = new Intl.NumberFormat('id-ID', {
  notation: 'compact',
  compactDisplay: 'short',
});

function formatTooltipValue(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
    value
  );
}

export function RevenueExpenseChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(85 16% 88%)" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => CURRENCY_FORMATTER.format(v)} />
        <Tooltip formatter={(value: number) => formatTooltipValue(value)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" name="Revenue" fill="hsl(152 40% 32%)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="expenses" name="Expenses" fill="hsl(3 72% 46%)" radius={[3, 3, 0, 0]} />
        <Line
          type="monotone"
          dataKey="netProfit"
          name="Net profit"
          stroke="hsl(85 24% 36%)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function DepositActivityChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(85 16% 88%)" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => CURRENCY_FORMATTER.format(v)} />
        <Tooltip formatter={(value: number) => formatTooltipValue(value)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="depositTopUps" name="Top-ups" fill="hsl(85 24% 36%)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="depositUsed" name="Used on orders" fill="hsl(38 85% 45%)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="depositRefunds" name="Refunds" fill="hsl(3 72% 46%)" radius={[3, 3, 0, 0]} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
