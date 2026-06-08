'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from 'recharts';
import { db } from '@/lib/firebase';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { asDate, money } from '@/lib/format';
import { Loader2, Users, ShoppingBag, DollarSign, TrendingUp } from 'lucide-react';

type Range = '7d' | '30d' | '90d' | 'all';

const RANGES: Record<Range, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null,
};

export default function AnalyticsPage() {
  const [users, setUsers] = useState<Array<{ createdAt: Date | null }>>([]);
  const [orders, setOrders] = useState<
    Array<{ createdAt: Date | null; total: number; status: string }>
  >([]);
  const [posts, setPosts] = useState<Array<{ category: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('30d');

  useEffect(() => {
    (async () => {
      try {
        const [u, o, p] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'orders')),
          getDocs(collection(db, 'posts')),
        ]);
        setUsers(
          u.docs.map((d) => ({
            createdAt: asDate((d.data() as { createdAt?: unknown }).createdAt),
          })),
        );
        setOrders(
          o.docs.map((d) => {
            const x = d.data() as Record<string, unknown>;
            return {
              createdAt: asDate(x.createdAt),
              total: (x.total as number) ?? 0,
              status: (x.status as string) ?? 'pending',
            };
          }),
        );
        setPosts(
          p.docs.map((d) => ({
            category: ((d.data() as { category?: string }).category as string) ?? '',
          })),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cutoff = useMemo(() => {
    const days = RANGES[range];
    if (!days) return null;
    return Date.now() - days * 24 * 60 * 60 * 1000;
  }, [range]);

  const inRange = <T extends { createdAt: Date | null }>(rows: T[]): T[] =>
    cutoff === null ? rows : rows.filter((r) => (r.createdAt?.getTime() ?? 0) >= cutoff);

  const usersR = useMemo(() => inRange(users), [users, cutoff]);
  const ordersR = useMemo(() => inRange(orders), [orders, cutoff]);

  const kpis = useMemo(() => {
    const revenue = ordersR
      .filter((o) =>
        ['delivered', 'shipping', 'in_progress', 'shipped', 'paid', 'processing'].includes(
          o.status,
        ),
      )
      .reduce((s, o) => s + o.total, 0);
    const aov = ordersR.length ? revenue / ordersR.length : 0;
    return {
      users: usersR.length,
      orders: ordersR.length,
      revenue,
      aov,
    };
  }, [usersR, ordersR]);

  const userGrowth = useMemo(() => buildDailyCount(usersR), [usersR]);
  const revenueByDay = useMemo(() => buildDailySum(ordersR), [ordersR]);
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    posts.forEach((p) => {
      if (!p.category) return;
      map[p.category] = (map[p.category] ?? 0) + 1;
    });
    return Object.entries(map)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [posts]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="px-8 py-8">
      <PageHeader title="Analytics" subtitle="Trends, revenue, and growth.">
        <div className="flex rounded-md border border-slate-200 bg-white p-0.5 text-sm">
          {(['7d', '30d', '90d', 'all'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={
                'rounded px-3 py-1.5 text-xs font-semibold uppercase transition-colors ' +
                (range === r
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100')
              }
            >
              {r}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="New users" value={kpis.users} icon={Users} />
        <StatCard label="Orders" value={kpis.orders} icon={ShoppingBag} />
        <StatCard label="Revenue" value={money(kpis.revenue)} icon={DollarSign} tone="success" />
        <StatCard
          label="Avg order value"
          value={money(kpis.aov)}
          icon={TrendingUp}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="User growth">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={userGrowth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="d" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#0f172a"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={revenueByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="d" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip formatter={(v) => money(typeof v === 'number' ? v : Number(v))} />
              <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top categories" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={Math.max(180, byCategory.length * 30)}>
            <BarChart data={byCategory} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis
                dataKey="category"
                type="category"
                tick={{ fontSize: 11 }}
                stroke="#94a3b8"
                width={110}
              />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={'rounded-xl border border-slate-200 bg-white p-5 ' + (className ?? '')}>
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h3>
      {children}
    </div>
  );
}

function buildDailyCount(rows: { createdAt: Date | null }[]) {
  const map: Record<string, number> = {};
  rows.forEach((r) => {
    if (!r.createdAt) return;
    const k = r.createdAt.toISOString().slice(0, 10);
    map[k] = (map[k] ?? 0) + 1;
  });
  return Object.entries(map)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([d, count]) => ({ d: d.slice(5), count }));
}

function buildDailySum(rows: { createdAt: Date | null; total: number }[]) {
  const map: Record<string, number> = {};
  rows.forEach((r) => {
    if (!r.createdAt) return;
    const k = r.createdAt.toISOString().slice(0, 10);
    map[k] = (map[k] ?? 0) + (r.total ?? 0);
  });
  return Object.entries(map)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([d, value]) => ({ d: d.slice(5), value }));
}
