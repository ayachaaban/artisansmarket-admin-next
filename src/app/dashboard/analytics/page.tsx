'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db } from '@/lib/firebase';
import { money, toDate } from '@/lib/legacy';

type Doc = Record<string, unknown>;

const STATUS_COLORS: Record<string, string> = {
  pending: '#E8B547',
  in_progress: '#5B8FA8',
  paid: '#5B8FA8',
  processing: '#5B8FA8',
  shipping: '#D67847',
  shipped: '#D67847',
  delivered: '#7A9B5C',
  cancelled: '#B5413B',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  shipping: 'Shipping',
  delivered: 'Delivered',
  paid: 'Paid',
  processing: 'Processing',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
};
const CATEGORY_PALETTE = ['#6F8FA3', '#C96A3D', '#E3A93C', '#7A9A7A', '#A44A3F', '#C98A5B'];

function fmtDay(d: Date) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export default function AnalyticsPage() {
  const [users, setUsers] = useState<Doc[]>([]);
  const [posts, setPosts] = useState<Doc[]>([]);
  const [orders, setOrders] = useState<Doc[]>([]);
  const [reports, setReports] = useState<Doc[]>([]);
  const [ratings, setRatings] = useState<Doc[]>([]);
  const [range, setRange] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [artistsSort, setArtistsSort] = useState<'earnings' | 'orders' | 'rating'>('earnings');
  const [catSort, setCatSort] = useState<'posts' | 'orders'>('posts');

  const load = useCallback(async () => {
    try {
      const [u, p, o, r, rt] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'posts')),
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'reports')).catch(() => ({ docs: [] }) as never),
        getDocs(collection(db, 'ratings')).catch(() => ({ docs: [] }) as never),
      ]);
      setUsers(u.docs.map((d) => d.data()));
      setPosts(p.docs.map((d) => d.data()));
      setOrders(o.docs.map((d) => d.data()));
      setReports(r.docs.map((d) => d.data()));
      setRatings(rt.docs.map((d) => d.data()));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const [start, end] = useMemo(() => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    if (range === 'custom' && from && to) return [new Date(from + 'T00:00:00'), new Date(to + 'T23:59:59')];
    return [new Date(2020, 0, 1), now];
  }, [range, from, to]);

  const inRange = useCallback(
    (doc: Doc) => {
      const d = toDate(doc.createdAt);
      if (!d) return false;
      const t = d.getTime();
      return t >= start.getTime() && t <= end.getTime();
    },
    [start, end],
  );

  const data = useMemo(() => {
    const u = users.filter(inRange);
    const p = posts.filter(inRange);
    const o = orders.filter(inRange);
    const rep = reports.filter(inRange);

    const kpis = [
      { label: 'New users', value: String(u.length), accent: '#84CC16' },
      { label: 'New artists', value: String(u.filter((d) => d.role === 'artist').length), accent: '#B85C38' },
      { label: 'New posts', value: String(p.length), accent: '#1B998B' },
      { label: 'New reels', value: String(p.filter((d) => d.mediaType === 'reel').length), accent: '#F59E0B' },
      { label: 'Orders', value: String(o.length), accent: '#2E86AB' },
      {
        label: 'Revenue',
        value: money(
          o.reduce(
            (s, d) =>
              ['shipping', 'delivered', 'shipped'].includes(d.status as string)
                ? s + ((d.total as number) || (d.totalAmount as number) || 0)
                : s,
            0,
          ),
        ),
        accent: '#10B981',
      },
      { label: 'Reports', value: String(rep.length), accent: '#A53A33' },
    ];

    // day buckets
    const days: string[] = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const last = new Date(end);
    last.setHours(0, 0, 0, 0);
    while (cursor.getTime() <= last.getTime()) {
      days.push(fmtDay(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    const usersByDay: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
    const revByDay: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
    u.forEach((d) => {
      const dt = toDate(d.createdAt);
      if (dt) {
        const k = fmtDay(dt);
        if (usersByDay[k] != null) usersByDay[k]++;
      }
    });
    o.forEach((d) => {
      if (!['shipping', 'delivered', 'shipped'].includes(d.status as string)) return;
      const dt = toDate(d.createdAt);
      if (dt) {
        const k = fmtDay(dt);
        if (revByDay[k] != null) revByDay[k] += (d.total as number) || (d.totalAmount as number) || 0;
      }
    });
    const lineData = days.map((d) => ({ day: d, users: usersByDay[d], rev: revByDay[d] }));

    const statusCounts: Record<string, number> = {};
    o.forEach((d) => {
      const s = (d.status as string) || 'unknown';
      if (s === 'refunded') return;
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    const statusData = Object.entries(statusCounts).map(([k, v]) => ({
      name: STATUS_LABEL[k] || k,
      value: v,
      color: STATUS_COLORS[k] || '#B85C38',
    }));

    const catCounts: Record<string, number> = {};
    p.forEach((d) => {
      const c = (d.category as string) || 'Uncategorised';
      catCounts[c] = (catCounts[c] || 0) + 1;
    });
    const catData = Object.entries(catCounts).map(([k, v], i) => ({
      name: k,
      value: v,
      color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
    }));

    // top artists
    const artistAgg: Record<string, { id: string; name: string; earnings: number; orders: number; rating: number; _rs?: number; _rc?: number }> = {};
    o.forEach((d) => {
      const aid = d.artistId as string;
      if (!aid) return;
      if (!artistAgg[aid]) artistAgg[aid] = { id: aid, name: (d.artistName as string) || 'Unknown', earnings: 0, orders: 0, rating: 0 };
      if (['shipping', 'delivered', 'shipped'].includes(d.status as string))
        artistAgg[aid].earnings += (d.total as number) || (d.totalAmount as number) || 0;
      artistAgg[aid].orders++;
    });
    ratings.forEach((d) => {
      const a = artistAgg[d.artistId as string];
      if (a) {
        a._rs = (a._rs || 0) + ((d.stars as number) || 0);
        a._rc = (a._rc || 0) + 1;
      }
    });
    Object.values(artistAgg).forEach((a) => (a.rating = a._rc ? (a._rs || 0) / a._rc : 0));

    const catAgg: Record<string, { name: string; posts: number; orders: number }> = {};
    p.forEach((d) => {
      const c = (d.category as string) || 'Uncategorised';
      if (!catAgg[c]) catAgg[c] = { name: c, posts: 0, orders: 0 };
      catAgg[c].posts++;
    });
    o.forEach((d) => {
      (d.items as { category?: string }[] | undefined)?.forEach((it) => {
        const c = it.category || 'Uncategorised';
        if (!catAgg[c]) catAgg[c] = { name: c, posts: 0, orders: 0 };
        catAgg[c].orders++;
      });
    });

    return {
      kpis,
      lineData,
      statusData,
      catData,
      artists: Object.values(artistAgg),
      categories: Object.values(catAgg),
    };
  }, [users, posts, orders, reports, ratings, inRange, start, end]);

  const topArtists = [...data.artists].sort((a, b) => (b[artistsSort] || 0) - (a[artistsSort] || 0)).slice(0, 10);
  const topCats = [...data.categories].sort((a, b) => (b[catSort] || 0) - (a[catSort] || 0)).slice(0, 10);
  const tickInterval = Math.max(0, Math.floor(data.lineData.length / 12));

  return (
    <div className="page-content active" id="analyticsPage">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap" style={{ gap: 10 }}>
        <h2 className="page-title mb-0">Analytics</h2>
        <div className="filters" style={{ margin: 0, alignItems: 'center' }}>
          <select className="form-select filter-select" style={{ minWidth: 180 }} value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="all">All time</option>
            <option value="custom">Custom range…</option>
          </select>
          {range === 'custom' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.78rem', color: '#8E8E8E' }}>From</span>
              <input type="date" className="form-control filter-select" style={{ width: 155 }} value={from} onChange={(e) => setFrom(e.target.value)} />
              <span style={{ fontSize: '0.78rem', color: '#8E8E8E' }}>To</span>
              <input type="date" className="form-control filter-select" style={{ width: 155 }} value={to} onChange={(e) => setTo(e.target.value)} />
            </span>
          )}
          <button
            onClick={load}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 1rem',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: '#2E86AB',
              background: 'transparent',
              border: '1.5px solid #2E86AB',
              borderRadius: 8,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="row g-3 mb-3">
        {data.kpis.map((k) => (
          <div className="col-lg-3 col-md-4 col-sm-6" key={k.label}>
            <div className="kpi-card" style={{ borderLeft: `3px solid ${k.accent}` }}>
              <div className="kpi-details">
                <h4>{k.value}</h4>
                <p>{k.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="row g-3">
        <div className="col-lg-6">
          <div className="chart-card">
            <h5>User Growth</h5>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.lineData} margin={{ top: 10, right: 10, bottom: 30, left: -10 }}>
                <CartesianGrid stroke="#eee" />
                <XAxis dataKey="day" interval={tickInterval} angle={-45} textAnchor="end" tick={{ fontSize: 9, fill: '#8E8E8E' }} height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8E8E8E' }} />
                <Tooltip />
                <Area type="monotone" dataKey="users" stroke="#6F8FA3" fill="#6F8FA322" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="chart-card">
            <h5>Revenue Trend</h5>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.lineData} margin={{ top: 10, right: 10, bottom: 30, left: -10 }}>
                <CartesianGrid stroke="#eee" />
                <XAxis dataKey="day" interval={tickInterval} angle={-45} textAnchor="end" tick={{ fontSize: 9, fill: '#8E8E8E' }} height={50} />
                <YAxis tick={{ fontSize: 11, fill: '#8E8E8E' }} />
                <Tooltip />
                <Area type="monotone" dataKey="rev" stroke="#7A9B5C" fill="#7A9B5C22" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="chart-card">
            <h5>Orders by Status</h5>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={data.statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={100} paddingAngle={1}>
                  {data.statusData.map((s, i) => (
                    <Cell key={i} fill={s.color} stroke="#fff" strokeWidth={2} />
                  ))}
                </Pie>
                <Legend verticalAlign="bottom" iconType="circle" />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="chart-card">
            <h5>Categories Breakdown</h5>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.catData} margin={{ top: 10, right: 10, bottom: 20, left: -10 }}>
                <CartesianGrid stroke="#eee" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#8E8E8E' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8E8E8E' }} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {data.catData.map((c, i) => (
                    <Cell key={i} fill={c.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top tables */}
      <div className="row g-3 mt-1">
        <div className="col-lg-6">
          <div className="chart-card">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h5 className="mb-0">Top Artists</h5>
              <select
                className="form-select filter-select"
                style={{ width: 'auto', fontSize: '0.78rem', padding: '4px 8px' }}
                value={artistsSort}
                onChange={(e) => setArtistsSort(e.target.value as typeof artistsSort)}
              >
                <option value="earnings">By earnings</option>
                <option value="orders">By orders</option>
                <option value="rating">By rating</option>
              </select>
            </div>
            <div className="table-responsive">
              <table className="table custom-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Artist</th>
                    <th>{artistsSort === 'earnings' ? 'Earnings' : artistsSort === 'orders' ? 'Orders' : 'Rating'}</th>
                  </tr>
                </thead>
                <tbody>
                  {topArtists.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center text-muted py-3">
                        No data in this range.
                      </td>
                    </tr>
                  ) : (
                    topArtists.map((a, i) => (
                      <tr key={a.id} style={{ cursor: 'pointer' }}>
                        <td>{i + 1}</td>
                        <td>{a.name}</td>
                        <td>
                          <strong>
                            {artistsSort === 'earnings'
                              ? money(a.earnings)
                              : artistsSort === 'orders'
                                ? a.orders
                                : a.rating
                                  ? a.rating.toFixed(2) + ' ★'
                                  : '—'}
                          </strong>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="chart-card">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h5 className="mb-0">Top Categories</h5>
              <select
                className="form-select filter-select"
                style={{ width: 'auto', fontSize: '0.78rem', padding: '4px 8px' }}
                value={catSort}
                onChange={(e) => setCatSort(e.target.value as typeof catSort)}
              >
                <option value="posts">By posts</option>
                <option value="orders">By orders</option>
              </select>
            </div>
            <div className="table-responsive">
              <table className="table custom-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Category</th>
                    <th>{catSort === 'posts' ? 'Posts' : 'Orders'}</th>
                  </tr>
                </thead>
                <tbody>
                  {topCats.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center text-muted py-3">
                        No data in this range.
                      </td>
                    </tr>
                  ) : (
                    topCats.map((c, i) => (
                      <tr key={c.name}>
                        <td>{i + 1}</td>
                        <td>{c.name}</td>
                        <td>
                          <strong>{c[catSort] || 0}</strong>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
