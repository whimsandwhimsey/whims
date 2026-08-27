'use client';

import { useState } from 'react';

/**
 * Looks for /public/qris.png. Store owner can drop their real QRIS code
 * there any time — nothing else needs to change. Until then, this shows a
 * friendly placeholder instead of a broken image icon.
 */
export function QrisDisplay() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex aspect-square w-full max-w-[240px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary text-center text-xs text-muted-foreground">
        <p className="px-4">
          QRIS code not uploaded yet — ask the store to add one, or transfer manually and mention
          it in your WhatsApp message.
        </p>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/qris.png"
      alt="Whims & Whimsey QRIS payment code"
      className="mx-auto w-full max-w-[240px] rounded-lg border border-border"
      onError={() => setFailed(true)}
    />
  );
}
