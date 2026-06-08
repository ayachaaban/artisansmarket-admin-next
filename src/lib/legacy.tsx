/* Shared helpers for the cloned (legacy-design) dashboard pages.
   Mirrors the helpers in artisansmarket-admin/js/*.js */
import type { Timestamp } from 'firebase/firestore';

export function money(v: unknown): string {
  return '$' + (Number(v) || 0).toFixed(2);
}

export function toDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  const t = ts as Timestamp;
  if (typeof t.toDate === 'function') return t.toDate();
  return null;
}

export function toMillis(ts: unknown): number {
  const d = toDate(ts);
  return d ? d.getTime() : 0;
}

export function fmtAgo(ts: unknown): string {
  const d = toDate(ts);
  if (!d) return '—';
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.floor(sec / 60) + ' min ago';
  if (sec < 86400) return Math.floor(sec / 3600) + ' h ago';
  if (sec < 604800) return Math.floor(sec / 86400) + ' d ago';
  return d.toLocaleDateString();
}

/* Mirrors computeAdminCancellation in dashboard.js / order_policy.dart.
   Returns the refund split for cancelling an order at its current state. */
const ORDER_POLICY = { maxExtensions: 3, maxExtensionDaysTotal: 14, freeCancelWindowHours: 24 };
export function computeAdminCancellation(order: Record<string, unknown>): {
  refund: number;
  artistShare: number;
  tier: string;
} {
  const total = (order.total as number) || (order.totalAmount as number) || 0;
  const now = Date.now();
  if (order.status === 'pending') return { refund: total, artistShare: 0, tier: 'pre_accept' };
  const created = toDate(order.createdAt);
  if (created && (now - created.getTime()) / 3600000 <= ORDER_POLICY.freeCancelWindowHours)
    return { refund: total, artistShare: 0, tier: 'free_window' };
  const exts = (order.extensions as { previousDeadline?: unknown; newDeadline?: unknown }[]) || [];
  const extCount = Array.isArray(exts) ? exts.length : 0;
  const extDays = exts.reduce((acc, e) => {
    const prev = toDate(e.previousDeadline);
    const next = toDate(e.newDeadline);
    if (!prev || !next) return acc;
    return acc + Math.max(0, Math.round((next.getTime() - prev.getTime()) / 86400000));
  }, 0);
  if (extCount >= ORDER_POLICY.maxExtensions || extDays > ORDER_POLICY.maxExtensionDaysTotal)
    return { refund: total, artistShare: 0, tier: 'over_extended' };
  if (order.status === 'shipping' || order.status === 'delivered')
    return { refund: 0, artistShare: total, tier: 'post_ship' };
  const accepted = toDate(order.acceptedAt);
  const deadline = toDate(order.estimatedCompletionDate);
  if (!accepted || !deadline) return { refund: total / 2, artistShare: total / 2, tier: 'unknown' };
  const totalWindow = (deadline.getTime() - accepted.getTime()) / 1000;
  const elapsed = (now - accepted.getTime()) / 1000;
  const remPct = totalWindow <= 0 ? 0 : Math.max(0, Math.min(1, (totalWindow - elapsed) / totalWindow));
  let penaltyPct: number, tier: string;
  if (remPct > 0.75) [penaltyPct, tier] = [0.1, 'early'];
  else if (remPct > 0.5) [penaltyPct, tier] = [0.25, 'mid_early'];
  else if (remPct > 0.25) [penaltyPct, tier] = [0.5, 'mid_late'];
  else [penaltyPct, tier] = [0.75, 'late'];
  const artistShare = total * penaltyPct;
  return { refund: total - artistShare, artistShare, tier };
}

export function hexAlpha(hex: string, a: number): string {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* Mirrors the mobile app's UserAvatar widget (admin-overview.js avatarHtml). */
export function Avatar({
  name,
  imgUrl,
  size = 32,
}: {
  name?: string;
  imgUrl?: string;
  size?: number;
}) {
  if (imgUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={imgUrl}
        alt={name || ''}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          background: 'rgba(111,143,163,0.12)',
        }}
      />
    );
  }
  const initial = (name || '?').trim().substring(0, 1).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'rgba(111,143,163,0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6F8FA3',
        fontWeight: 700,
        fontSize: Math.round(size * 0.42),
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}
