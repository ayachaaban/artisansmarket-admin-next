'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Avatar, toDate, toMillis } from '@/lib/legacy';
import { toast, sendBroadcast as runBroadcast } from '@/lib/ui';

type Notif = { id: string; type?: string; userId?: string; isRead?: boolean; createdAt?: unknown };
type Broadcast = { id: string; title?: string; message?: string; audience?: string; recipients?: number; createdAt?: unknown };

const TYPE_COLORS = ['#2E86AB', '#1B998B', '#A53A33', '#6F8FA3', '#E3A93C', '#B85C38', '#7A9B5C', '#C98A5B'];

function humanize(t?: string) {
  if (!t) return 'Other';
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [names, setNames] = useState<Record<string, { name: string; role: string }>>({});
  const [audience, setAudience] = useState('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [activeChip, setActiveChip] = useState('all');
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(500)));
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Notif, 'id'>) }));
      setNotifs(list);
      const ids = [...new Set(list.map((n) => n.userId).filter(Boolean))].slice(0, 40) as string[];
      const docs = await Promise.all(ids.map((id) => getDoc(doc(db, 'users', id)).catch(() => null)));
      const map: Record<string, { name: string; role: string }> = {};
      docs.forEach((d) => {
        if (d && d.exists()) map[d.id] = { name: (d.data().name as string) || 'User', role: (d.data().role as string) || '' };
      });
      setNames(map);
    } catch {
      setNotifs([]);
    }
    try {
      const bsnap = await getDocs(query(collection(db, 'broadcasts'), orderBy('createdAt', 'desc'), limit(50)));
      setBroadcasts(bsnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Broadcast, 'id'>) })));
    } catch {
      setBroadcasts([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const total = notifs.length;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    let sentToday = 0,
      thisMonth = 0,
      unread = 0;
    const byType: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    notifs.forEach((n) => {
      const ms = toMillis(n.createdAt);
      if (ms >= todayStart.getTime()) sentToday++;
      if (ms >= monthStart.getTime()) thisMonth++;
      if (n.isRead === false) unread++;
      const t = n.type || 'other';
      byType[t] = (byType[t] || 0) + 1;
      if (n.userId) byUser[n.userId] = (byUser[n.userId] || 0) + 1;
    });
    const types = Object.entries(byType).sort((a, b) => b[1] - a[1]);
    const recipients = Object.entries(byUser)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    return { total, sentToday, thisMonth, unread, types, topType: types[0]?.[0], recipients };
  }, [notifs]);

  const kpi = (val: React.ReactNode, label: string) => (
    <div className="col">
      <div className="kpi-card">
        <div className="kpi-details">
          <h4>{val}</h4>
          <p>{label}</p>
        </div>
      </div>
    </div>
  );

  const [sending, setSending] = useState(false);
  async function sendBroadcast() {
    if (!title.trim() || !message.trim()) return toast('Enter a title and message.', 'warning');
    setSending(true);
    toast('Sending broadcast…', 'info');
    try {
      const r = await runBroadcast(audience as 'all' | 'artists' | 'customers', title, message);
      toast(`Broadcast sent to ${r.recipients} user(s) — ${r.pushed} device(s) reached.`, 'success');
      setTitle('');
      setMessage('');
      load();
    } catch {
      toast('Failed to send broadcast.', 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page-content active" id="broadcastPage">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap" style={{ gap: 10 }}>
        <h2 className="page-title mb-0">Notifications</h2>
        <div className="filters" style={{ margin: 0 }}>
          <input type="text" className="form-control filter-select" placeholder="Search title, message, recipient..." style={{ minWidth: 260 }} />
          <select className="form-select filter-select">
            <option>Most recent</option>
          </select>
          <button
            onClick={load}
            style={{ padding: '0.45rem 1rem', color: '#2E86AB', background: 'transparent', border: '1.5px solid #2E86AB', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="row g-3 mb-3">
        {kpi(stats.total, 'Total (last 500)')}
        {kpi(stats.sentToday, 'Sent today')}
        {kpi(stats.thisMonth, 'This month')}
        {kpi(stats.unread, 'Unread')}
        {kpi(<span style={{ fontSize: 18 }}>{humanize(stats.topType)}</span>, 'Top type')}
      </div>

      <div className="row g-3">
        {/* LEFT: broadcast form + sent */}
        <div className="col-lg-8">
          <div className="chart-card mb-3">
            <h5 style={{ marginBottom: 14 }}>Send broadcast notification</h5>
            <div className="mb-3" style={{ maxWidth: 220 }}>
              <label className="form-label" style={{ fontSize: 12, color: '#5C6B73' }}>
                Audience
              </label>
              <select className="form-select filter-select" value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option value="all">All users</option>
                <option value="artists">Artists</option>
                <option value="customers">Customers</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label" style={{ fontSize: 12, color: '#5C6B73' }}>
                Title
              </label>
              <input
                type="text"
                className="form-control filter-select"
                placeholder="e.g. Holiday sale starts tomorrow!"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ maxWidth: '100%' }}
              />
            </div>
            <div className="mb-3">
              <label className="form-label" style={{ fontSize: 12, color: '#5C6B73' }}>
                Message
              </label>
              <textarea
                className="form-control filter-select"
                rows={3}
                placeholder="Body of the notification"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                style={{ maxWidth: '100%', resize: 'vertical' }}
              />
            </div>
            <div className="d-flex" style={{ gap: 8 }}>
              <button className="btn-action btn-view" onClick={() => toast(`Audience: ${audience === 'all' ? 'All users' : audience}`, 'info')}>
                Preview audience
              </button>
              <button className="btn-action btn-approve" onClick={sendBroadcast} disabled={sending}>
                {sending ? 'Sending…' : 'Send broadcast'}
              </button>
            </div>
          </div>

          <div className="chart-card">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h5 className="mb-0">Sent broadcasts</h5>
              <span className="text-muted" style={{ fontSize: 12 }}>
                {broadcasts.length} total
              </span>
            </div>
            {broadcasts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#8E8E8E', fontSize: 13 }}>No broadcasts sent yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {broadcasts.map((b) => {
                  const d = toDate(b.createdAt);
                  const aud = b.audience === 'all' || !b.audience ? 'All users' : b.audience;
                  const n = b.recipients ?? 0;
                  return (
                    <div key={b.id} style={{ borderBottom: '1px solid #F0F0F0', paddingBottom: 8 }}>
                      <div className="d-flex justify-content-between" style={{ gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#2C3E50' }}>{b.title || 'Untitled'}</span>
                        <span style={{ fontSize: 11, color: '#8E8E8E', whiteSpace: 'nowrap' }}>{d ? d.toLocaleDateString() : ''}</span>
                      </div>
                      {b.message && <div style={{ fontSize: 12, color: '#5C6B73', marginTop: 2 }}>{b.message}</div>}
                      <div style={{ fontSize: 11, color: '#8E8E8E', marginTop: 2 }}>
                        {aud} · {n} recipient{n === 1 ? '' : 's'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-3" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[['all', 'All', stats.total] as const, ...stats.types.map((t, i) => [t[0], humanize(t[0]), t[1], i] as const)].map((c, i) => {
                const id = c[0] as string;
                const color = id === 'all' ? '#2E86AB' : TYPE_COLORS[i % TYPE_COLORS.length];
                const sel = activeChip === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveChip(id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 16,
                      border: `1.5px solid ${sel ? color : '#E6E6E6'}`,
                      background: sel ? color + '12' : 'white',
                      color: sel ? color : '#555',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {c[1]} {c[2]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT: by type + top recipients */}
        <div className="col-lg-4">
          <div className="chart-card mb-3">
            <h5 style={{ marginBottom: 12 }}>By type (this batch)</h5>
            {stats.types.map(([t, c], i) => {
              const max = stats.types[0]?.[1] || 1;
              const color = TYPE_COLORS[i % TYPE_COLORS.length];
              return (
                <div key={t} style={{ marginBottom: 10 }}>
                  <div className="d-flex justify-content-between" style={{ fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: '#2C3E50' }}>{humanize(t)}</span>
                    <span style={{ color: '#8E8E8E', fontWeight: 600 }}>{c}</span>
                  </div>
                  <div style={{ height: 4, background: '#F0F0F0', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${(c / max) * 100}%`, height: '100%', background: color }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="chart-card">
            <h5 style={{ marginBottom: 12 }}>Top recipients</h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.recipients.map(([uid, count]) => {
                const u = names[uid];
                return (
                  <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={u?.name} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#2C3E50', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {u?.name || uid.substring(0, 8)}
                      </div>
                      <div style={{ fontSize: 11, color: '#8E8E8E' }}>{u?.role || '—'}</div>
                    </div>
                    <strong style={{ color: '#2E86AB', fontSize: 14 }}>{count}</strong>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
