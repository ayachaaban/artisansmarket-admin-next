'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageHeader } from '@/components/page-header';
import { FilterChips } from '@/components/filter-chips';
import { StatCard } from '@/components/stat-card';
import { asDate, relTime } from '@/lib/format';
import { cn, initials } from '@/lib/utils';
import { Loader2, Star } from 'lucide-react';

type Rating = {
  id: string;
  artistId: string;
  artistName: string;
  customerId: string;
  customerName: string;
  stars: number;
  comment: string;
  createdAt: Date | null;
};

export default function RatingsPage() {
  const [items, setItems] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | '5' | '4' | '3' | 'low'>('all');
  const [sort, setSort] = useState<'recent' | 'highest' | 'lowest'>('recent');

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'ratings'), orderBy('createdAt', 'desc')),
        );
        setItems(
          snap.docs.map((d) => {
            const x = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              artistId: (x.artistId as string) ?? '',
              artistName: (x.artistName as string) ?? '',
              customerId: (x.customerId as string) ?? '',
              customerName: (x.customerName as string) ?? '',
              stars: (x.stars as number) ?? 0,
              comment: (x.comment as string) ?? (x.feedback as string) ?? '',
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
    let list = items;
    if (filter === '5') list = list.filter((r) => r.stars === 5);
    else if (filter === '4') list = list.filter((r) => r.stars === 4);
    else if (filter === '3') list = list.filter((r) => r.stars === 3);
    else if (filter === 'low') list = list.filter((r) => r.stars <= 2);

    if (sort === 'highest') list = [...list].sort((a, b) => b.stars - a.stars);
    else if (sort === 'lowest') list = [...list].sort((a, b) => a.stars - b.stars);
    return list;
  }, [items, filter, sort]);

  const dist = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    items.forEach((r) => {
      const i = Math.max(1, Math.min(5, Math.floor(r.stars))) - 1;
      counts[i]++;
    });
    const max = Math.max(1, ...counts);
    return counts.map((c) => ({ count: c, pct: Math.round((c / max) * 100) }));
  }, [items]);

  const avg = useMemo(() => {
    if (items.length === 0) return 0;
    return items.reduce((s, r) => s + r.stars, 0) / items.length;
  }, [items]);

  const topArtists = useMemo(() => {
    const map: Record<string, { name: string; total: number; n: number }> = {};
    items.forEach((r) => {
      const k = r.artistId;
      if (!k) return;
      if (!map[k]) map[k] = { name: r.artistName || '—', total: 0, n: 0 };
      map[k].total += r.stars;
      map[k].n++;
    });
    return Object.values(map)
      .filter((a) => a.n >= 2)
      .map((a) => ({ ...a, avg: a.total / a.n }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);
  }, [items]);

  return (
    <div className="px-8 py-8">
      <PageHeader
        title="Ratings"
        subtitle={loading ? 'Loading…' : `${filtered.length} of ${items.length} reviews`}
      >
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: '5', label: '5★' },
            { value: '4', label: '4★' },
            { value: '3', label: '3★' },
            { value: 'low', label: 'Low (1-2★)' },
          ]}
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="recent">Most recent</option>
          <option value="highest">Highest rated</option>
          <option value="lowest">Lowest rated</option>
        </select>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <StatCard
              label="Average rating"
              value={avg ? avg.toFixed(2) : '—'}
              icon={Star}
              tone="success"
            />
            <StatCard label="Total reviews" value={items.length} icon={Star} />
            <StatCard
              label="Low ratings"
              value={items.filter((r) => r.stars <= 2).length}
              icon={Star}
              tone="warning"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Distribution
            </h3>
            {[5, 4, 3, 2, 1].map((s) => {
              const d = dist[s - 1];
              return (
                <div key={s} className="mb-2 flex items-center gap-3 text-sm">
                  <span className="flex w-10 items-center gap-1 font-semibold">
                    {s} <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-amber-400"
                      style={{ width: `${d.pct}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs text-slate-500">{d.count}</span>
                </div>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {loading ? (
              <div className="px-5 py-12 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-slate-500">No reviews.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <li key={r.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                        {initials(r.customerName || '?')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">
                            {r.customerName || 'Customer'}
                          </p>
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={cn(
                                  'h-3.5 w-3.5',
                                  i < r.stars
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-slate-200',
                                )}
                              />
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-slate-500">
                          for {r.artistName || '—'} · {relTime(r.createdAt)}
                        </p>
                        {r.comment && (
                          <p className="mt-1.5 text-sm text-slate-700">{r.comment}</p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Top rated artists
            </h3>
            {topArtists.length === 0 ? (
              <p className="text-sm text-slate-500">Not enough data.</p>
            ) : (
              <ul className="space-y-3">
                {topArtists.map((a, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">
                        {initials(a.name)}
                      </div>
                      <p className="text-sm font-medium">{a.name}</p>
                    </div>
                    <span className="flex items-center gap-1 text-sm font-semibold text-amber-600">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {a.avg.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
