'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Avatar, fmtAgo, toDate, toMillis } from '@/lib/legacy';
import { exportDataXlsx } from '@/lib/export';
import { useDetail } from '@/components/detail-modals';

type Rating = {
  stars?: number;
  artistId?: string;
  customerName?: string;
  feedback?: string;
  artistName?: string;
  createdAt?: unknown;
};
type Artist = { name?: string; category?: string; profileImageUrl?: string; averageRating?: number };

function StarRow({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1, lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= n ? '#F59E0B' : '#E0E0E0', fontSize: size }}>
          ★
        </span>
      ))}
    </span>
  );
}

const ExportIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z" />
    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z" />
  </svg>
);

const CHIPS = [
  { id: 'all', label: 'All', color: '#2E86AB' },
  { id: '5', label: '5★', color: '#1B998B' },
  { id: '4', label: '4★', color: '#84CC16' },
  { id: '3', label: '3★', color: '#E3A93C' },
  { id: 'low', label: '1-2★ (low)', color: '#A53A33' },
];

export default function RatingsPage() {
  const { openUser } = useDetail();
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [artistMap, setArtistMap] = useState<Record<string, Artist>>({});
  const [topArtists, setTopArtists] = useState<{ id: string; a: Artist }[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');

  const load = useCallback(async () => {
    try {
      let snap;
      try {
        snap = await getDocs(query(collection(db, 'ratings'), orderBy('createdAt', 'desc'), limit(500)));
      } catch {
        snap = await getDocs(query(collection(db, 'ratings'), limit(500)));
      }
      const rs = snap.docs.map((d) => d.data() as Rating);
      setRatings(rs);
      const ids = [...new Set(rs.map((r) => r.artistId).filter(Boolean))] as string[];
      const docs = await Promise.all(ids.map((id) => getDoc(doc(db, 'users', id))));
      const map: Record<string, Artist> = {};
      docs.forEach((d) => {
        if (d.exists()) map[d.id] = d.data() as Artist;
      });
      setArtistMap(map);
    } catch {
      setRatings([]);
    }
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where('role', '==', 'artist'), orderBy('averageRating', 'desc'), limit(10)),
      );
      setTopArtists(snap.docs.map((d) => ({ id: d.id, a: d.data() as Artist })));
    } catch {
      setTopArtists([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = useMemo(() => {
    const total = ratings.length;
    const counts = [0, 0, 0, 0, 0, 0];
    let sum = 0;
    let thisMonth = 0;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    ratings.forEach((r) => {
      const s = r.stars || 0;
      counts[s] = (counts[s] || 0) + 1;
      sum += s;
      if (toMillis(r.createdAt) >= monthStart.getTime()) thisMonth++;
    });
    const avg = total > 0 ? sum / total : 0;
    return { total, counts, avg, thisMonth, five: counts[5] || 0, low: (counts[1] || 0) + (counts[2] || 0) };
  }, [ratings]);

  const feed = useMemo(() => {
    const s = search.toLowerCase();
    const match = (stars: number) =>
      filter === 'all' ? true : filter === 'low' ? stars <= 2 : Number(filter) === stars;
    const list = ratings.filter((r) => {
      if (!match(r.stars || 0)) return false;
      if (s) {
        const artist = r.artistId ? artistMap[r.artistId] : undefined;
        const hay = ((artist?.name || '') + ' ' + (r.customerName || '') + ' ' + (r.feedback || '')).toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    if (sort === 'highest') list.sort((a, b) => (b.stars || 0) - (a.stars || 0));
    else if (sort === 'lowest') list.sort((a, b) => (a.stars || 0) - (b.stars || 0));
    else list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    return list.slice(0, 60);
  }, [ratings, artistMap, filter, search, sort]);

  const kpiCard = (label: string, val: string | number, accent: string) => (
    <div className="col-lg col-md-4 col-sm-6" key={label}>
      <div className="kpi-card" style={{ borderLeft: `3px solid ${accent}` }}>
        <div className="kpi-details">
          <h4 style={{ margin: 0 }}>{val}</h4>
          <p style={{ margin: 0, fontSize: 11 }}>{label}</p>
        </div>
      </div>
    </div>
  );

  const rankColors = ['#FBBF24', '#9CA3AF', '#C8602F'];

  return (
    <div className="page-content active" id="ratingsPage">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap" style={{ gap: 10 }}>
        <h2 className="page-title mb-0">Ratings</h2>
        <div className="filters" style={{ margin: 0 }}>
          <input
            type="text"
            className="form-control filter-select"
            placeholder="Search artist or customer..."
            style={{ minWidth: 240 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="form-select filter-select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Most recent</option>
            <option value="highest">Highest rated</option>
            <option value="lowest">Lowest rated</option>
          </select>
          <button
            className="btn-export"
            onClick={() =>
              exportDataXlsx(
                'ratings',
                ['Artist', 'Customer', 'Stars', 'Comment', 'Created At'],
                ratings.map((r) => [
                  (r.artistId && artistMap[r.artistId]?.name) || r.artistName || '',
                  r.customerName || '',
                  r.stars || 0,
                  (r.feedback || '').replace(/\r?\n/g, ' '),
                  toDate(r.createdAt)?.toISOString() || '',
                ]),
              )
            }
          >
            <ExportIcon />
            Export Excel
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="row g-3 mb-3">
        {kpiCard('Total reviews', kpis.total, '#2E86AB')}
        {kpiCard('Average', kpis.avg.toFixed(2) + ' ★', '#F59E0B')}
        {kpiCard('This month', kpis.thisMonth, '#10B981')}
        {kpiCard('5★ reviews', kpis.five, '#84CC16')}
        {kpiCard('Low (1-2★)', kpis.low, '#A53A33')}
      </div>

      <div className="row g-3">
        {/* LEFT */}
        <div className="col-lg-8">
          <div className="chart-card mb-3">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
                <div style={{ fontSize: 48, fontWeight: 800, color: '#262626', lineHeight: 1 }}>
                  {kpis.avg.toFixed(1)}
                </div>
                <div style={{ margin: '6px 0' }}>
                  <StarRow n={Math.round(kpis.avg)} size={20} />
                </div>
                <div style={{ color: '#8E8E8E', fontSize: 12 }}>
                  {kpis.total} {kpis.total === 1 ? 'review' : 'reviews'}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                {[5, 4, 3, 2, 1].map((s) => {
                  const c = kpis.counts[s] || 0;
                  const pct = kpis.total > 0 ? Math.round((c / kpis.total) * 100) : 0;
                  const color = s === 5 ? '#1B998B' : s === 4 ? '#84CC16' : s === 3 ? '#E3A93C' : '#A53A33';
                  return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '5px 0' }}>
                      <span style={{ width: 30, fontSize: 12, color: '#8E8E8E', fontWeight: 600 }}>{s}★</span>
                      <div style={{ flex: 1, height: 8, background: '#F0F0F0', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
                      </div>
                      <span style={{ width: 60, textAlign: 'right', fontSize: 12, color: '#8E8E8E' }}>
                        {c} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Filter chips */}
          <div className="mb-3" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CHIPS.map((c) => {
              const sel = c.id === filter;
              return (
                <button
                  key={c.id}
                  onClick={() => setFilter(c.id)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 18,
                    border: `1.5px solid ${sel ? c.color : '#E6E6E6'}`,
                    background: sel ? c.color + '12' : 'white',
                    color: sel ? c.color : '#555',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* Reviews feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {feed.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: '#8E8E8E',
                  fontSize: 13,
                  background: 'white',
                  borderRadius: 10,
                  border: '1px solid #ECECEC',
                }}
              >
                No reviews match these filters.
              </div>
            ) : (
              feed.map((r, i) => {
                const artist = (r.artistId && artistMap[r.artistId]) || {};
                const fb = (r.feedback || '').trim();
                const stars = r.stars || 0;
                const lineColor = stars >= 5 ? '#1B998B' : stars === 4 ? '#84CC16' : stars === 3 ? '#E3A93C' : '#A53A33';
                return (
                  <div
                    key={i}
                    style={{
                      background: 'white',
                      border: '1px solid #ECECEC',
                      borderLeft: `4px solid ${lineColor}`,
                      borderRadius: 10,
                      padding: '14px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10, marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <Avatar name={artist.name} imgUrl={artist.profileImageUrl} size={36} />
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{ fontWeight: 700, fontSize: 13, color: '#262626', cursor: r.artistId ? 'pointer' : 'default', textDecoration: r.artistId ? 'underline' : 'none' }}
                            onClick={() => r.artistId && openUser(r.artistId)}
                          >
                            {artist.name || 'Unknown artist'}
                          </div>
                          <div style={{ fontSize: 11, color: '#8E8E8E' }}>
                            {artist.category ? artist.category + ' · ' : ''}
                            from {r.customerName || 'a customer'}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <StarRow n={stars} size={15} />
                        <div style={{ fontSize: 10, color: '#8E8E8E', marginTop: 2 }}>{fmtAgo(r.createdAt)}</div>
                      </div>
                    </div>
                    {fb ? (
                      <div style={{ fontSize: 13, color: '#444', lineHeight: 1.5, paddingLeft: 46 }}>{fb}</div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#BDBDBD', fontStyle: 'italic', paddingLeft: 46 }}>
                        No written feedback
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="col-lg-4">
          <div className="chart-card">
            <h5 style={{ margin: '0 0 10px', fontSize: 14, color: '#262626' }}>Top Rated Artists</h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topArtists.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#8E8E8E', fontSize: 12, padding: 20 }}>No artists yet.</div>
              ) : (
                topArtists.map(({ id, a }, i) => {
                  const rating = typeof a.averageRating === 'number' ? a.averageRating.toFixed(2) : '—';
                  const rankBg = i < 3 ? rankColors[i] : '#E6E6E6';
                  return (
                    <div
                      key={id}
                      onClick={() => openUser(id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: 8,
                        borderRadius: 8,
                        cursor: 'pointer',
                        background: i < 3 ? rankBg + '11' : 'transparent',
                      }}
                    >
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: rankBg,
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </span>
                      <Avatar name={a.name} imgUrl={a.profileImageUrl} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 13,
                            color: '#262626',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {a.name || 'Unknown'}
                        </div>
                        <div style={{ fontSize: 11, color: '#8E8E8E' }}>{a.category || '—'}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#F59E0B' }}>{rating} ★</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
