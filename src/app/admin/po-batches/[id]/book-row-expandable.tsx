'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function BookRowExpandable({
  title,
  buyers,
}: {
  title: string;
  buyers: { name: string; phoneLast4: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-left hover:text-primary"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span>{title}</span>
      </button>
      {open && (
        <ul className="mt-1.5 space-y-0.5 pl-5 text-xs text-muted-foreground">
          {buyers.map((b, i) => (
            <li key={i}>
              {b.name} · ···{b.phoneLast4}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
