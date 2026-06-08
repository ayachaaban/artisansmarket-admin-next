'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageHeader } from '@/components/page-header';
import { SearchInput } from '@/components/search-input';
import { StatCard } from '@/components/stat-card';
import { asDate, money, statusPillClass } from '@/lib/format';
import { cn, fmtDate } from '@/lib/utils';
import { Loader2, Wallet, DollarSign, TrendingUp } from 'lucide-react';

type Payout = {
  id: string;
  artistId: string;
  artistName?: string;
  amount: number;
  status: string;
  createdAt: Date | null;
};

type Wallet = {
  artistId: string;
  artistName: string;
  email: string;
  balance: number;
  totalReleased: number;
  pending: number;
  updatedAt: Date | null;
};

export default function PayoutsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [usersSnap, walletsSnap, payoutsSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'wallets')),
          getDocs(query(collection(db, 'payouts'), orderBy('createdAt', 'desc'))),
        ]);

        const userById: Record<string, { name: string; email: string; role: string }> = {};
        usersSnap.forEach((d) => {
          const x = d.data() as { name?: string; email?: string; role?: string };
          userById[d.id] = {
            name: x.name ?? '',
            email: x.email ?? '',
            role: x.role ?? '',
          };
        });

        const allPayouts: Payout[] = payoutsSnap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>;
          const aid = (x.artistId as string) ?? '';
          return {
            id: d.id,
            artistId: aid,
            artistName: userById[aid]?.name,
            amount: (x.amount as number) ?? 0,
            status: (x.status as string) ?? 'pending',
            createdAt: asDate(x.createdAt),
          };
        });
        setPayouts(allPayouts);

        const releasedByArtist: Record<string, number> = {};
        const pendingByArtist: Record<string, number> = {};
        allPayouts.forEach((p) => {
          if (p.status === 'released' || p.status === 'completed') {
            releasedByArtist[p.artistId] = (releasedByArtist[p.artistId] ?? 0) + p.amount;
          } else if (p.status === 'pending') {
            pendingByArtist[p.artistId] = (pendingByArtist[p.artistId] ?? 0) + p.amount;
          }
        });

        const rows: Wallet[] = [];
        walletsSnap.forEach((d) => {
          const x = d.data() as { balance?: number; updatedAt?: unknown };
          const u = userById[d.id];
          if (!u || u.role !== 'artist') return;
          rows.push({
            artistId: d.id,
            artistName: u.name,
            email: u.email,
            balance: x.balance ?? 0,
            totalReleased: releasedByArtist[d.id] ?? 0,
            pending: pendingByArtist[d.id] ?? 0,
            updatedAt: asDate(x.updatedAt),
          });
        });
        // Include artists with no wallet doc yet
        Object.entries(userById).forEach(([id, u]) => {
          if (u.role !== 'artist') return;
          if (rows.find((r) => r.artistId === id)) return;
          rows.push({
            artistId: id,
            artistName: u.name,
            email: u.email,
            balance: 0,
            totalReleased: releasedByArtist[id] ?? 0,
            pending: pendingByArtist[id] ?? 0,
            updatedAt: null,
          });
        });
        rows.sort((a, b) => b.balance - a.balance);
        setWallets(rows);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredWallets = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return wallets;
    return wallets.filter(
      (w) => w.artistName.toLowerCase().includes(s) || w.email.toLowerCase().includes(s),
    );
  }, [wallets, q]);

  const kpis = useMemo(() => {
    let inWallets = 0;
    let released = 0;
    wallets.forEach((w) => {
      inWallets += w.balance;
      released += w.totalReleased;
    });
    return { inWallets, released, total: payouts.length };
  }, [wallets, payouts]);

  return (
    <div className="px-8 py-8">
      <PageHeader
        title="Payouts"
        subtitle={loading ? 'Loading…' : `${filteredWallets.length} artist wallets`}
      >
        <SearchInput value={q} onChange={setQ} placeholder="Search artist" />
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="In wallets" value={money(kpis.inWallets)} icon={Wallet} />
        <StatCard label="Total released" value={money(kpis.released)} icon={DollarSign} tone="success" />
        <StatCard label="Payouts recorded" value={kpis.total} icon={TrendingUp} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Artist</th>
              <th className="px-5 py-3 font-semibold">Email</th>
              <th className="px-5 py-3 font-semibold">Wallet</th>
              <th className="px-5 py-3 font-semibold">Released</th>
              <th className="px-5 py-3 font-semibold">Pending</th>
              <th className="px-5 py-3 font-semibold">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                </td>
              </tr>
            ) : filteredWallets.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">
                  No artists.
                </td>
              </tr>
            ) : (
              filteredWallets.map((w) => (
                <tr key={w.artistId} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium">{w.artistName || '—'}</td>
                  <td className="px-5 py-3 text-slate-700">{w.email}</td>
                  <td className="px-5 py-3 font-semibold">{money(w.balance)}</td>
                  <td className="px-5 py-3 text-slate-700">{money(w.totalReleased)}</td>
                  <td className="px-5 py-3 text-slate-700">{money(w.pending)}</td>
                  <td className="px-5 py-3 text-slate-500">{fmtDate(w.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wider text-slate-500">
        Recent payouts
      </h2>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Artist</th>
              <th className="px-5 py-3 font-semibold">Amount</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payouts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500">
                  No payouts yet.
                </td>
              </tr>
            ) : (
              payouts.slice(0, 50).map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">{p.artistName ?? p.artistId.slice(0, 8)}</td>
                  <td className="px-5 py-3 font-semibold">{money(p.amount)}</td>
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
