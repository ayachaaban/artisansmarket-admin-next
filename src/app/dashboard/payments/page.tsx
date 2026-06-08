'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageHeader } from '@/components/page-header';
import { SearchInput } from '@/components/search-input';
import { StatCard } from '@/components/stat-card';
import { asDate, money, statusPillClass } from '@/lib/format';
import { cn, fmtDate } from '@/lib/utils';
import { Loader2, CreditCard, DollarSign, Repeat } from 'lucide-react';

type Payment = {
  id: string;
  amount: number;
  status: string;
  type?: string;
  paymentMethod?: string;
  userId?: string;
  userName?: string;
  orderId?: string;
  createdAt: Date | null;
};

export default function PaymentsPage() {
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'payments'), orderBy('createdAt', 'desc')),
        );
        setItems(
          snap.docs.map((d) => {
            const x = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              amount: (x.amount as number) ?? 0,
              status: (x.status as string) ?? 'pending',
              type: x.type as string | undefined,
              paymentMethod: x.paymentMethod as string | undefined,
              userId: x.userId as string | undefined,
              userName: (x.userName as string) ?? (x.customerName as string) ?? undefined,
              orderId: x.orderId as string | undefined,
              createdAt: asDate(x.createdAt),
            };
          }),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((p) => {
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (methodFilter !== 'all' && p.paymentMethod !== methodFilter) return false;
      if (!s) return true;
      return (
        (p.userName ?? '').toLowerCase().includes(s) ||
        (p.userId ?? '').toLowerCase().includes(s) ||
        p.id.toLowerCase().includes(s)
      );
    });
  }, [items, q, typeFilter, statusFilter, methodFilter]);

  const kpis = useMemo(() => {
    let completed = 0;
    let subRev = 0;
    items.forEach((p) => {
      if (p.status === 'completed') completed += p.amount;
      if (p.type === 'subscription' && p.status === 'completed') subRev += p.amount;
    });
    return { total: items.length, completed, subRev };
  }, [items]);

  const types = useMemo(() => Array.from(new Set(items.map((p) => p.type).filter(Boolean) as string[])), [items]);
  const statuses = useMemo(() => Array.from(new Set(items.map((p) => p.status))), [items]);
  const methods = useMemo(
    () => Array.from(new Set(items.map((p) => p.paymentMethod).filter(Boolean) as string[])),
    [items],
  );

  return (
    <div className="px-8 py-8">
      <PageHeader
        title="Payments"
        subtitle={loading ? 'Loading…' : `${filtered.length} of ${items.length}`}
      >
        <SearchInput value={q} onChange={setQ} placeholder="User, payment ID" />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm capitalize"
        >
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm capitalize"
        >
          <option value="all">All status</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm capitalize"
        >
          <option value="all">All methods</option>
          {methods.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Total payments" value={kpis.total} icon={CreditCard} />
        <StatCard label="Completed" value={money(kpis.completed)} icon={DollarSign} tone="success" />
        <StatCard label="Subscription revenue" value={money(kpis.subRev)} icon={Repeat} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">ID</th>
              <th className="px-5 py-3 font-semibold">Type</th>
              <th className="px-5 py-3 font-semibold">User</th>
              <th className="px-5 py-3 font-semibold">Amount</th>
              <th className="px-5 py-3 font-semibold">Method</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">
                  No payments match.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">
                    {p.id.slice(0, 8)}…
                  </td>
                  <td className="px-5 py-3 capitalize">{p.type ?? '—'}</td>
                  <td className="px-5 py-3">{p.userName ?? p.userId?.slice(0, 8) ?? '—'}</td>
                  <td className="px-5 py-3 font-semibold">{money(p.amount)}</td>
                  <td className="px-5 py-3 capitalize">{p.paymentMethod ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
                        statusPillClass(p.status),
                      )}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{fmtDate(p.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
