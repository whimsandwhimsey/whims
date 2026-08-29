'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Select } from '@/components/ui/select';

const SORT_LABELS: Record<string, string> = {
  recent: 'Terbaru',
  name_asc: 'Nama (A-Z)',
  name_desc: 'Nama (Z-A)',
  orders_desc: 'Total order (terbanyak)',
};

export function CustomerSortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('sort') ?? 'recent';

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== 'recent') {
      params.set('sort', value);
    } else {
      params.delete('sort');
    }
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={current} onChange={(e) => handleChange(e.target.value)}>
      {Object.entries(SORT_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </Select>
  );
}
