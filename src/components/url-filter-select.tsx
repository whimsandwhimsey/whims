'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Select } from '@/components/ui/select';

export function UrlFilterSelect({
  paramKey,
  allLabel,
  options,
}: {
  paramKey: string;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(paramKey) ?? '';

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(paramKey, value);
    } else {
      params.delete(paramKey);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={current} onChange={(e) => handleChange(e.target.value)}>
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
