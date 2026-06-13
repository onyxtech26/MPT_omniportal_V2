'use client';

import { useState } from 'react';
import { getBrandImageUrl } from '@/lib/brandImages';

export function WatchIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32" fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <rect x="12" y="2" width="8" height="5" rx="2" fill="#cbd5e1" />
      <rect x="12" y="25" width="8" height="5" rx="2" fill="#cbd5e1" />
      <circle cx="16" cy="16" r="11" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="9" fill="white" stroke="#94a3b8" strokeWidth="1" />
      <line x1="16" y1="10" x2="16" y2="16" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="16" x2="20" y2="18" stroke="#475569" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1" fill="#1e293b" />
    </svg>
  );
}

export function BrandImage({ brand, size = 32 }: { brand: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(() => getBrandImageUrl(brand));
  if (!src) return <WatchIcon size={size} />;
  return (
    <img
      src={src}
      alt={brand}
      width={size}
      height={size}
      className="rounded-md object-contain bg-white border border-slate-100 shrink-0"
      style={{ minWidth: size, minHeight: size }}
      onError={() => setSrc(null)}
    />
  );
}
