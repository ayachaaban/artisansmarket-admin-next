import { Timestamp } from 'firebase/firestore';

export function asDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'object' && v !== null && 'toDate' in v) {
    try {
      return (v as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  return null;
}

export function money(n: number | undefined | null): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function relTime(d: Date | null | undefined): string {
  if (!d) return '—';
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} d ago`;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function statusPillClass(s: string): string {
  const map: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700',
    completed: 'bg-emerald-50 text-emerald-700',
    delivered: 'bg-emerald-50 text-emerald-700',
    paid: 'bg-emerald-50 text-emerald-700',
    pending: 'bg-amber-50 text-amber-700',
    in_progress: 'bg-blue-50 text-blue-700',
    processing: 'bg-blue-50 text-blue-700',
    shipping: 'bg-indigo-50 text-indigo-700',
    shipped: 'bg-indigo-50 text-indigo-700',
    reviewed: 'bg-slate-100 text-slate-700',
    suspended: 'bg-red-50 text-red-700',
    cancelled: 'bg-red-50 text-red-700',
    refunded: 'bg-red-50 text-red-700',
    failed: 'bg-red-50 text-red-700',
    removed: 'bg-red-50 text-red-700',
    reported: 'bg-amber-50 text-amber-700',
    sold: 'bg-slate-100 text-slate-700',
    expired: 'bg-slate-100 text-slate-700',
  };
  return map[s] ?? 'bg-slate-100 text-slate-700';
}
