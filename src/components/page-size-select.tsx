'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Select } from '@/components/ui/select';

const OPTIONS = ['25', '50', '100', '200', 'all'];
const LABELS: Record<string, string> = {
  '25': '25 / page',
  '50': '50 / page',
  '100': '100 / page',
  '200': '200 / page',
  all: 'View all',
};

export function PageSizeSelect({ defaultValue = '25' }: { defaultValue?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('viewAll') === '1' ? 'all' : searchParams.get('pageSize') ?? defaultValue;

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    if (value === 'all') {
      params.set('viewAll', '1');
      params.delete('pageSize');
    } else {
      params.delete('viewAll');
      if (value === defaultValue) params.delete('pageSize');
      else params.set('pageSize', value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={current} onChange={(e) => handleChange(e.target.value)} className="w-32">
      {OPTIONS.map((o) => (
        <option key={o} value={o}>
          {LABELS[o]}
        </option>
      ))}
    </Select>
  );
}
