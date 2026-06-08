'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Avatar, fmtAgo, hexAlpha, money } from '@/lib/legacy';
import { useDetail } from '@/components/detail-modals';

type Row = Record<string, unknown>;

type PulseItem = { label: string; val: string | number; accent: string; sub?: string };
type ListItem = {
  id: string;
  name: string;
  sub: string;
  badge?: { text: string; bg: string; color: string };
};
type Event = { ts: number; color: string; text: React.ReactNode; sub?: string };

const QUICK = [
  { title: 'Send notification', desc: 'Broadcast to users', color: '#2E86AB' },
  { title: 'Deadlines', desc: 'Monitor orders', color: '#1B998B' },
  { title: 'Triage reports', desc: 'Review flagged', color: '#A53A33' },
  { title: 'Reviews', desc: 'Customer feedback', color: '#E3A93C' },
];

function safeDocs(s: { docs: unknown[] } | null): { id: string; data: () => Row }[] {
  // @ts-expect-error firestore querysnapshot shape
  return s && s.docs ? s.docs : [];
}

export default function OverviewPage() {
  const { openOrder, openReport, openUser } = useDetail();
  const [pulse, setPulse] = useState<PulseItem[] | null>(null);
  const [overdue, setOverdue] = useState<ListItem[]>([]);
  const [pendingReports, setPendingReports] = useState<ListItem[]>([]);
  const [noPayout, setNoPayout] = useState<{ list: ListItem[]; extra: number }>({ list: [], extra: 0 });
  const [newArtists, setNewArtists] = useState<ListItem[]>([]);
  const [activity, setActivity] = useState<Event[]>([]);
  const [snapshot, setSnapshot] = useState<[string, string | number][]>([]);
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(
        d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) +
          ' · ' +
          d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      );
    };
    tick();
    const iv = setInterval(tick, 30000);
    return () => clearInterval(iv);
  }, []);

  const run = useCallback(async () => {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tsToday = Timestamp.fromDate(todayStart);
    const tsSeven = Timestamp.fromDate(new Date(now - 7 * 86400000));
    const get = (...c: Parameters<typeof query>) =>
      getDocs(query(...c)).catch(() => ({ docs: [] }) as never);

    const [todayOrders, todayUsers, todayPosts, pendingRep, inProg, processing, recentArtists, allArtists] =
      await Promise.all([
        get(collection(db, 'orders'), where('createdAt', '>=', tsToday)),
        get(collection(db, 'users'), where('createdAt', '>=', tsToday)),
        get(collection(db, 'posts'), where('createdAt', '>=', tsToday)),
        get(collection(db, 'reports'), where('status', '==', 'pending')),
        get(collection(db, 'orders'), where('status', '==', 'in_progress')),
        get(collection(db, 'orders'), where('status', '==', 'processing')),
        get(collection(db, 'users'), where('role', '==', 'artist'), where('createdAt', '>=', tsSeven)),
        get(collection(db, 'users'), where('role', '==', 'artist'), limit(200)),
      ]);

    const newOrders = safeDocs(todayOrders).length;
    let todayRev = 0;
    safeDocs(todayOrders).forEach((d) => {
      const o = d.data();
      if (['shipping', 'delivered', 'shipped'].includes(o.status as string))
        todayRev += (o.total as number) || (o.totalAmount as number) || 0;
    });

    const inFlight = [...safeDocs(inProg), ...safeDocs(processing)];
    const overdueRaw: { id: string; o: Row; ms: number }[] = [];
    const soon: number[] = [];
    inFlight.forEach((d) => {
      const o = d.data();
      const dl = o.estimatedCompletionDate as Timestamp | undefined;
      if (!dl || typeof dl.toDate !== 'function') return;
      const ms = dl.toDate().getTime();
      const remaining = ms - now;
      if (remaining < 0) overdueRaw.push({ id: d.id, o, ms });
      else if (remaining < 48 * 3600 * 1000) soon.push(ms);
    });
    overdueRaw.sort((a, b) => a.ms - b.ms);

    setPulse([
      { label: 'New orders', val: newOrders, accent: '#2E86AB', sub: 'today' },
      { label: 'Revenue', val: money(todayRev), accent: '#10B981', sub: 'today' },
      { label: 'New users', val: safeDocs(todayUsers).length, accent: '#84CC16', sub: 'today' },
      { label: 'New posts', val: safeDocs(todayPosts).length, accent: '#1B998B', sub: 'today' },
      { label: 'Pending reports', val: safeDocs(pendingRep).length, accent: '#A53A33', sub: 'awaiting review' },
      { label: 'Overdue orders', val: overdueRaw.length, accent: '#F59E0B', sub: soon.length + ' due in <48h' },
    ]);

    // resolve user names
    const ids = new Set<string>();
    overdueRaw.forEach((x) => {
      ids.add(x.o.artistId as string);
      ids.add(x.o.customerId as string);
    });
    safeDocs(pendingRep).forEach((d) => ids.add(d.data().reporterId as string));
    const userMap: Record<string, Row> = {};
    await Promise.all(
      [...ids].filter(Boolean).map(async (id) => {
        try {
          const ds = await getDoc(doc(db, 'users', id));
          if (ds.exists()) userMap[id] = ds.data();
        } catch {
          /* ignore */
        }
      }),
    );

    setOverdue(
      overdueRaw.slice(0, 5).map((item) => {
        const days = Math.floor((now - item.ms) / 86400000);
        const hrs = Math.floor((now - item.ms) / 3600000);
        const u = userMap[item.o.artistId as string] || {};
        return {
          id: item.id,
          name: (item.o.artistName as string) || (u.name as string) || 'Artist',
          sub: '→ ' + ((item.o.customerName as string) || 'customer'),
          badge: {
            text: (days > 0 ? days + 'd' : hrs + 'h') + ' late',
            bg: 'rgba(165,58,51,0.15)',
            color: '#A53A33',
          },
          img: u.profileImageUrl as string,
        } as ListItem & { img?: string };
      }),
    );

    setPendingReports(
      safeDocs(pendingRep)
        .slice(0, 5)
        .map((d) => {
          const r = d.data();
          const u = userMap[r.reporterId as string] || {};
          return {
            id: d.id,
            name: (r.reason as string) || 'Report',
            sub: 'By ' + ((u.name as string) || (r.reporterName as string) || 'someone') + ' · ' + fmtAgo(r.createdAt),
          };
        }),
    );

    const missing = safeDocs(allArtists).filter((d) => {
      const pc = d.data().payoutCard as { last4?: string } | undefined;
      return !pc || typeof pc !== 'object' || !pc.last4;
    });
    setNoPayout({
      list: missing.slice(0, 5).map((d) => {
        const u = d.data();
        return {
          id: d.id,
          name: (u.name as string) || 'Artist',
          sub: (u.category as string) || '—',
          badge: { text: 'blocked', bg: 'rgba(165,58,51,0.15)', color: '#A53A33' },
          img: u.profileImageUrl as string,
        } as ListItem & { img?: string };
      }),
      extra: Math.max(0, missing.length - 5),
    });

    setNewArtists(
      safeDocs(recentArtists)
        .slice(0, 5)
        .map((d) => {
          const u = d.data();
          return {
            id: d.id,
            name: (u.name as string) || 'Artist',
            sub: ((u.category as string) || '—') + ' · joined ' + fmtAgo(u.createdAt),
            img: u.profileImageUrl as string,
          } as ListItem & { img?: string };
        }),
    );

    // activity feed (last 24h)
    const since = Timestamp.fromDate(new Date(now - 86400000));
    const [aO, aU, aR, aRt] = await Promise.all([
      get(collection(db, 'orders'), where('createdAt', '>=', since)),
      get(collection(db, 'users'), where('createdAt', '>=', since)),
      get(collection(db, 'reports'), where('createdAt', '>=', since)),
      get(collection(db, 'ratings'), where('createdAt', '>=', since)),
    ]);
    const events: Event[] = [];
    safeDocs(aO).forEach((d) => {
      const o = d.data();
      events.push({
        ts: (o.createdAt as Timestamp)?.toMillis?.() || 0,
        color: '#2E86AB',
        text: (
          <>
            <strong>{(o.customerName as string) || 'A customer'}</strong> ordered from{' '}
            <strong>{(o.artistName as string) || 'an artist'}</strong>
          </>
        ),
        sub: money((o.total as number) || (o.totalAmount as number) || 0),
      });
    });
    safeDocs(aU).forEach((d) => {
      const u = d.data();
      events.push({
        ts: (u.createdAt as Timestamp)?.toMillis?.() || 0,
        color: '#84CC16',
        text: (
          <>
            New {(u.role as string) || 'user'}: <strong>{(u.name as string) || 'someone'}</strong>
          </>
        ),
        sub: (u.category as string) || (u.email as string) || '',
      });
    });
    safeDocs(aR).forEach((d) => {
      const r = d.data();
      events.push({
        ts: (r.createdAt as Timestamp)?.toMillis?.() || 0,
        color: '#A53A33',
        text: (
          <>
            Report filed: <strong>{(r.reason as string) || 'Report'}</strong>
          </>
        ),
        sub: 'by ' + ((r.reporterName as string) || 'someone'),
      });
    });
    safeDocs(aRt).forEach((d) => {
      const r = d.data();
      const stars = (r.stars as number) || 0;
      const isLow = stars <= 2;
      const fb = (r.feedback as string) || '';
      events.push({
        ts: (r.createdAt as Timestamp)?.toMillis?.() || 0,
        color: isLow ? '#A53A33' : '#F59E0B',
        text: (
          <>
            {stars}-star {isLow && <strong style={{ color: '#A53A33' }}>low </strong>}rating for{' '}
            <strong>{(r.artistName as string) || 'an artist'}</strong>
          </>
        ),
        sub: fb.substring(0, 60) + (fb.length > 60 ? '…' : ''),
      });
    });
    events.sort((a, b) => b.ts - a.ts);
    setActivity(events.slice(0, 20));

    // snapshot
    const [usersC, artistsC, postsC, activeC, ratingsAll] = await Promise.all([
      getDocs(collection(db, 'users')).then((s) => s.size).catch(() => 0),
      getDocs(query(collection(db, 'users'), where('role', '==', 'artist'))).then((s) => s.size).catch(() => 0),
      getDocs(collection(db, 'posts')).then((s) => s.size).catch(() => 0),
      getDocs(query(collection(db, 'posts'), where('status', '==', 'active'))).then((s) => s.size).catch(() => 0),
      get(collection(db, 'ratings')),
    ]);
    let avg = 0;
    const rdocs = safeDocs(ratingsAll);
    if (rdocs.length) {
      let sum = 0;
      rdocs.forEach((d) => (sum += (d.data().stars as number) || 0));
      avg = sum / rdocs.length;
    }
    setSnapshot([
      ['Total users', usersC],
      ['Artists', artistsC],
      ['Posts', postsC],
      ['Active posts', activeC],
      ['Avg rating', avg ? avg.toFixed(2) : '—'],
    ]);
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const empty = (msg: string) => (
    <div style={{ textAlign: 'center', padding: '20px 10px', color: '#8E8E8E', fontSize: 12 }}>{msg}</div>
  );

  const renderList = (
    items: (ListItem & { img?: string })[],
    emptyMsg: string,
    withAvatar = true,
    onItem?: (id: string) => void,
  ) =>
    items.length === 0
      ? empty(emptyMsg)
      : items.map((it) => (
          <div
            key={it.id}
            onClick={() => onItem?.(it.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 6px',
              borderBottom: '1px solid #F5F5F7',
              cursor: onItem ? 'pointer' : 'default',
            }}
          >
            {withAvatar && <Avatar name={it.name} imgUrl={it.img} size={32} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 12,
                  color: '#262626',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {it.name}
              </div>
              <div style={{ fontSize: 11, color: '#8E8E8E' }}>{it.sub}</div>
            </div>
            {it.badge && (
              <span
                style={{
                  background: it.badge.bg,
                  color: it.badge.color,
                  padding: '3px 8px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {it.badge.text}
              </span>
            )}
          </div>
        ));

  return (
    <div id="overviewPage">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap" style={{ gap: 10 }}>
        <div>
          <h2 className="page-title mb-0">Operations</h2>
          <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
            What needs your attention right now
          </p>
        </div>
        <div className="filters" style={{ margin: 0 }}>
          <span className="text-muted" style={{ fontSize: 12, lineHeight: '34px' }}>
            {clock}
          </span>
          <button className="btn-export" onClick={run}>
            Refresh
          </button>
        </div>
      </div>

      {/* Today's pulse strip */}
      <div className="row g-3 mb-3">
        {(pulse || []).map((p) => (
          <div className="col-lg-2 col-md-4 col-sm-6" key={p.label}>
            <div
              className="kpi-card"
              style={{ borderLeft: `3px solid ${p.accent}`, ['--card-accent' as string]: p.accent }}
            >
              <div className="kpi-details">
                <h4 style={{ margin: 0 }}>{p.val}</h4>
                <p style={{ margin: 0, fontSize: 11 }}>{p.label}</p>
                {p.sub && <p style={{ margin: 0, fontSize: 10, color: '#8E8E8E' }}>{p.sub}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3">
        {/* LEFT */}
        <div className="col-lg-8">
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <div className="chart-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h5 style={{ margin: 0, fontSize: 14, color: '#262626' }}>Overdue orders</h5>
                  <span style={{ fontSize: 11, color: '#8E8E8E', textDecoration: 'underline' }}>View all</span>
                </div>
                <div>{renderList(overdue, 'No overdue orders. Nice.', true, openOrder)}</div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="chart-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h5 style={{ margin: 0, fontSize: 14, color: '#262626' }}>Pending reports</h5>
                  <span style={{ fontSize: 11, color: '#8E8E8E', textDecoration: 'underline' }}>View all</span>
                </div>
                <div>{renderList(pendingReports, 'No pending reports.', false, openReport)}</div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="chart-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h5 style={{ margin: 0, fontSize: 14, color: '#262626' }}>Artists missing payout card</h5>
                  <span style={{ fontSize: 11, color: '#8E8E8E' }}>Blocks accepting orders</span>
                </div>
                <div>
                  {renderList(noPayout.list, 'Every artist has a payout card.', true, openUser)}
                  {noPayout.extra > 0 && (
                    <div style={{ textAlign: 'center', fontSize: 11, color: '#8E8E8E', padding: 6 }}>
                      + {noPayout.extra} more
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="chart-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h5 style={{ margin: 0, fontSize: 14, color: '#262626' }}>New artists (last 7 days)</h5>
                  <span style={{ fontSize: 11, color: '#8E8E8E' }}>Awaiting first sale</span>
                </div>
                <div>{renderList(newArtists, 'No new artists this week.', true, openUser)}</div>
              </div>
            </div>
          </div>

          {/* Activity feed */}
          <div className="chart-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h5 style={{ margin: 0, fontSize: 14, color: '#262626' }}>Live activity</h5>
              <span style={{ fontSize: 11, color: '#8E8E8E' }}>Last 24h across the platform</span>
            </div>
            <div>
              {activity.length === 0
                ? empty('No activity in the last 24 hours.')
                : activity.map((e, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        gap: 12,
                        alignItems: 'start',
                        padding: '8px 4px',
                        borderBottom: '1px solid #F5F5F7',
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: e.color,
                          flexShrink: 0,
                          marginTop: 6,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#262626', lineHeight: 1.4 }}>{e.text}</div>
                        {e.sub && <div style={{ fontSize: 11, color: '#8E8E8E', marginTop: 2 }}>{e.sub}</div>}
                      </div>
                      <span style={{ fontSize: 10, color: '#8E8E8E', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {e.ts ? fmtAgo(new Date(e.ts)) : ''}
                      </span>
                    </div>
                  ))}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="col-lg-4">
          <div className="chart-card mb-3">
            <h5 style={{ margin: '0 0 10px', fontSize: 14, color: '#262626' }}>At a glance</h5>
            <div>
              {snapshot.map(([label, val]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 4px',
                    borderBottom: '1px solid #F5F5F7',
                  }}
                >
                  <span style={{ flex: 1, fontSize: 12, color: '#8E8E8E' }}>{label}</span>
                  <strong style={{ fontSize: 13, color: '#262626' }}>{val}</strong>
                </div>
              ))}
            </div>
            <div
              style={{
                borderTop: '1px solid #F0F0F0',
                marginTop: 10,
                paddingTop: 10,
                fontSize: 11,
                color: '#8E8E8E',
                textAlign: 'center',
              }}
            >
              For trends and date-range analysis, open{' '}
              <span style={{ color: '#2E86AB', textDecoration: 'underline' }}>Analytics →</span>
            </div>
          </div>
          <div className="chart-card" style={{ padding: 14 }}>
            <h5 style={{ margin: '0 0 12px', fontSize: 14, color: '#262626' }}>Quick actions</h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {QUICK.map((q) => (
                <button
                  key={q.title}
                  className="quick-action-tile"
                  style={{
                    background: hexAlpha(q.color, 0.1),
                    border: `1.5px solid ${hexAlpha(q.color, 0.45)}`,
                    color: q.color,
                  }}
                >
                  <span className="qa-title" style={{ color: q.color }}>
                    {q.title}
                  </span>
                  <span className="qa-desc">{q.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
