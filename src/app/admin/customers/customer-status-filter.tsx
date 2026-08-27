'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Select } from '@/components/ui/select';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending approval',
  ACTIVE: 'Active',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
};

export function CustomerStatusFilterSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('status') ?? '';

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set('status', value);
    } else {
      params.delete('status');
    }
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={current} onChange={(e) => handleChange(e.target.value)}>
      <option value="">All statuses</option>
      {Object.entries(STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </Select>
  );
}
