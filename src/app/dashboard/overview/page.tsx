'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { StatCard } from '@/components/stat-card';
import { asDate, money, relTime, statusPillClass } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  Users,
  Palette,
  ImageIcon,
  Flag,
  Star,
  ShoppingBag,
  Loader2,
} from 'lucide-react';

type Stats = {
  totalUsers: number;
  totalArtists: number;
  totalCustomers: number;
  totalPosts: number;
  activePosts: number;
  pendingReports: number;
  avgRating: number;
  totalOrders: number;
};

type Activity = {
  kind: 'order' | 'rating' | 'post';
  title: string;
  sub: string;
  status?: string;
  at: Date | null;
};

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [users, posts, orders, reports, ratings] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'posts')),
          getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(10))),
          getDocs(collection(db, 'reports')),
          getDocs(query(collection(db, 'ratings'), orderBy('createdAt', 'desc'), limit(10))),
        ]);

        let artists = 0;
        let customers = 0;
        users.forEach((d) => {
          const r = (d.data() as { role?: string }).role;
          if (r === 'artist') artists++;
          else if (r === 'customer') customers++;
        });

        let active = 0;
        posts.forEach((d) => {
          if ((d.data() as { status?: string }).status === 'active') active++;
        });

        let pendingReports = 0;
        reports.forEach((d) => {
          if ((d.data() as { status?: string }).status === 'pending') pendingReports++;
        });

        let total = 0;
        let n = 0;
        ratings.forEach((d) => {
          const s = (d.data() as { stars?: number }).stars;
          if (typeof s === 'number') {
            total += s;
            n++;
          }
        });

        setStats({
          totalUsers: users.size,
          totalArtists: artists,
          totalCustomers: customers,
          totalPosts: posts.size,
          activePosts: active,
          pendingReports,
          avgRating: n ? total / n : 0,
          totalOrders: orders.size,
        });

        const recent: Activity[] = [];
        orders.forEach((d) => {
          const x = d.data() as Record<string, unknown>;
          recent.push({
            kind: 'order',
            title: `Order ${money(x.total as number)} — ${x.customerName ?? '—'}`,
            sub: `to ${x.artistName ?? '—'}`,
            status: x.status as string,
            at: asDate(x.createdAt),
          });
        });
        ratings.forEach((d) => {
          const x = d.data() as Record<string, unknown>;
          recent.push({
            kind: 'rating',
            title: `${x.stars}★ rating from ${x.customerName ?? '—'}`,
            sub: `for ${x.artistName ?? '—'}`,
            at: asDate(x.createdAt),
          });
        });
        recent.sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
        setActivity(recent.slice(0, 12));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-slate-500">Operations at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total users" value={stats.totalUsers} icon={Users} />
        <StatCard label="Artists" value={stats.totalArtists} icon={Palette} />
        <StatCard label="Customers" value={stats.totalCustomers} icon={Users} />
        <StatCard label="Posts" value={stats.totalPosts} icon={ImageIcon} />
        <StatCard
          label="Active posts"
          value={stats.activePosts}
          icon={ImageIcon}
          tone="success"
        />
        <StatCard
          label="Pending reports"
          value={stats.pendingReports}
          icon={Flag}
          tone={stats.pendingReports > 0 ? 'warning' : 'default'}
        />
        <StatCard label="Recent orders" value={stats.totalOrders} icon={ShoppingBag} />
        <StatCard
          label="Avg rating"
          value={stats.avgRating ? stats.avgRating.toFixed(2) : '—'}
          icon={Star}
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Recent activity
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {activity.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              No recent activity.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activity.map((a, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between px-5 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-800">{a.title}</p>
                    <p className="truncate text-xs text-slate-500">{a.sub}</p>
                  </div>
                  {a.status && (
                    <span
                      className={cn(
                        'mx-3 rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
                        statusPillClass(a.status),
                      )}
                    >
                      {a.status.replace(/_/g, ' ')}
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{relTime(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
