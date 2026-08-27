import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild disabled={prevDisabled}>
          <Link
            href={buildHref(page - 1)}
            aria-disabled={prevDisabled}
            tabIndex={prevDisabled ? -1 : undefined}
            className={prevDisabled ? 'pointer-events-none opacity-50' : ''}
          >
            Previous
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild disabled={nextDisabled}>
          <Link
            href={buildHref(page + 1)}
            aria-disabled={nextDisabled}
            tabIndex={nextDisabled ? -1 : undefined}
            className={nextDisabled ? 'pointer-events-none opacity-50' : ''}
          >
            Next
          </Link>
        </Button>
      </div>
    </div>
  );
}
