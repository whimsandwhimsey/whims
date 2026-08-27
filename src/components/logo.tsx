import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The real brand wordmark ("Whims & Whimsey" — navy/gold/orange/teal
 * lettering with cloud accents). Source file lives at /public/logo.png
 * (transparent background, trimmed to content). Width/height keep the
 * image's natural ~3753x1037 aspect ratio.
 */
export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/logo.png"
      alt="Whims & Whimsey"
      width={3753}
      height={1037}
      priority={priority}
      className={cn('h-auto w-full max-w-[220px]', className)}
    />
  );
}
    