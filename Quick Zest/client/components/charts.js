'use client';

import { inr } from '@/lib/format';

export const CHART = { income: '#0d9488', expenses: '#f97c10', profit: '#1c1917', grid: '#e7e5e4', axis: '#78716c' };

export function MoneyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-stone-800">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="num flex items-center gap-2 text-stone-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-medium text-stone-900">{inr(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export const compact = (v) => (Math.abs(v) >= 100000 ? `${(v / 100000).toFixed(1)}L` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v);

