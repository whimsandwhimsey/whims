import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The real brand wordmark (sage-green "Whims & Whimsey" wordmark). Source
 * file lives at /public/logo.png (transparent background, trimmed to
 * content). Width/height keep the image's natural 1000x444 aspect ratio.
 */
export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/logo.png"
      alt="Whims & Whimsey"
      width={1000}
      height={444}
      priority={priority}
      className={cn('h-auto w-full max-w-[220px]', className)}
    />
  );
}
