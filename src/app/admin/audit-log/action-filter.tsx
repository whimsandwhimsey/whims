'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Select } from '@/components/ui/select';

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT', 'IMPORT'];

export function AuditActionFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('action') ?? '';

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set('action', value);
    } else {
      params.delete('action');
    }
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={current} onChange={(e) => handleChange(e.target.value)}>
      <option value="">All actions</option>
      {ACTIONS.map((a) => (
        <option key={a} value={a}>
          {a}
        </option>
      ))}
    </Select>
  );
}
