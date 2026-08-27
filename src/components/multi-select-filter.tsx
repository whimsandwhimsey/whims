'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MultiSelectFilter({
  paramKey,
  label,
  options,
}: {
  paramKey: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = (searchParams.get(paramKey) ?? '').split(',').filter(Boolean);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggle(value: string) {
    const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
    const params = new URLSearchParams(searchParams.toString());
    if (next.length > 0) {
      params.set(paramKey, next.join(','));
    } else {
      params.delete(paramKey);
    }
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-10 items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm',
          selected.length > 0 && 'border-primary text-primary'
        )}
      >
        {label}
        {selected.length > 0 && (
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
            {selected.length}
          </span>
        )}
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md">
          {options.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No options.</p>}
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-secondary"
            >
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="h-4 w-4 rounded border-input"
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
