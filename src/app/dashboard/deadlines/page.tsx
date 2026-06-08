'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toDate } from '@/lib/legacy';
import { useDetail } from '@/components/detail-modals';
import { exportPageTable } from '@/lib/export';

type Order = {
  id: string;
  customerName?: string;
  artistName?: string;
  status?: string;
  estimatedCompletionDate?: unknown;
  extensions?: unknown[];
};
type Row = { id: string; order: Order; deadlineMs: number | null; urgency: 'overdue' | 'soon' | 'ok' | 'pending' };

const SOON_HOURS = 48;
const ExportIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z" />
    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z" />
  </svg>
);

function statusClass(status?: string) {
  const map: Record<string, string> = {
    pending: 'pending', in_progress: 'reported', shipping: 'expired', delivered: 'reviewed',
    paid: 'active', processing: 'reported', shipped: 'expired', cancelled: 'cancelled', refunded: 'removed',
  };
  return map[status || ''] || 'pending';
}
function statusLabel(status?: string) {
  const map: Record<string, string> = {
    pending: 'Pending', in_progress: 'In Progress', shipping: 'Shipping', delivered: 'Delivered',
    paid: 'Paid', processing: 'Processing', shipped: 'Shipped', cancelled: 'Cancelled', refunded: 'Refunded',
  };
  return map[status || ''] || status || 'Unknown';
}

export default function DeadlinesPage() {
  const { openOrder } = useDetail();
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState({ overdue: 0, soon: 0, extended: 0, onTrack: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [urgency, setUrgency] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = ['pending', 'in_progress', 'paid', 'processing'];
      const snaps = await Promise.all(
        statuses.map((s) => getDocs(query(collection(db, 'orders'), where('status', '==', s)))),
      );
      const now = Date.now();
      const out: Row[] = [];
      let overdue = 0, soon = 0, extended = 0, onTrack = 0;
      snaps.forEach((snap) => {
        snap.docs.forEach((d) => {
          const o = { id: d.id, ...(d.data() as Omit<Order, 'id'>) };
          const dl = toDate(o.estimatedCompletionDate);
          if (!dl) {
            if (o.status === 'pending' || o.status === 'paid')
              out.push({ id: o.id, order: o, deadlineMs: null, urgency: 'pending' });
            return;
          }
          const ms = dl.getTime();
          const rem = ms - now;
          let u: Row['urgency'];
          if (rem < 0) { u = 'overdue'; overdue++; }
          else if (rem < SOON_HOURS * 3600 * 1000) { u = 'soon'; soon++; }
          else { u = 'ok'; onTrack++; }
          if (Array.isArray(o.extensions) && o.extensions.length > 0) extended++;
          out.push({ id: o.id, order: o, deadlineMs: ms, urgency: u });
        });
      });
      const score = (u: string) => (u === 'overdue' ? 0 : u === 'soon' ? 1 : u === 'ok' ? 2 : 3);
      out.sort((a, b) => score(a.urgency) - score(b.urgency) || (a.deadlineMs || Infinity) - (b.deadlineMs || Infinity));
      setRows(out);
      setCounts({ overdue, soon, extended, onTrack });
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return rows.filter((r) => {
      if (urgency && r.urgency !== urgency) return false;
      if (s && !((r.order.customerName || '') + ' ' + (r.order.artistName || '')).toLowerCase().includes(s)) return false;
      return true;
    });
  }, [rows, search, urgency]);

  const kpi = (id: string, val: number, label: string, accent: string) => (
    <div className="col-lg-3 col-md-6" key={id}>
      <div className="kpi-card" style={{ borderLeft: `3px solid ${accent}` }}>
        <div className="kpi-details">
          <h4>{val}</h4>
          <p>{label}</p>
        </div>
      </div>
    </div>
  );

  const timePill = (r: Row) => {
    const now = Date.now();
    if (r.urgency === 'overdue' && r.deadlineMs) {
      const h = Math.round((now - r.deadlineMs) / 3600000);
      return (
        <span className="status-badge" style={{ background: 'rgba(165,58,51,0.10)', color: '#A53A33', border: '1.5px solid rgba(165,58,51,0.45)' }}>
          {h > 24 ? Math.floor(h / 24) + 'd overdue' : h + 'h overdue'}
        </span>
      );
    }
    if (r.urgency === 'soon' && r.deadlineMs) {
      const h = Math.round((r.deadlineMs - now) / 3600000);
      return (
        <span className="status-badge" style={{ background: 'rgba(227,169,60,0.10)', color: '#E3A93C', border: '1.5px solid rgba(227,169,60,0.45)' }}>
          {h}h left
        </span>
      );
    }
    if (r.urgency === 'ok' && r.deadlineMs) {
      const d = Math.floor((r.deadlineMs - now) / 86400000);
      return (
        <span className="status-badge" style={{ background: 'rgba(27,153,139,0.10)', color: '#1B998B', border: '1.5px solid rgba(27,153,139,0.45)' }}>
          {d}d left
        </span>
      );
    }
    return (
      <span className="status-badge" style={{ background: 'rgba(111,143,163,0.10)', color: '#6F8FA3', border: '1.5px solid rgba(111,143,163,0.45)' }}>
        Awaiting accept
      </span>
    );
  };

  return (
    <div className="page-content active" id="deadlinesPage">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="page-title mb-0">Order Deadlines</h2>
        <button className="btn-export" onClick={() => exportPageTable('deadlines')}>
          <ExportIcon />
          Export Excel
        </button>
      </div>

      <div className="row g-3 mb-4">
        {kpi('overdue', counts.overdue, 'Overdue', '#A53A33')}
        {kpi('soon', counts.soon, 'Due in < 48h', '#E3A93C')}
        {kpi('extended', counts.extended, 'Extended at least once', '#B85C38')}
        {kpi('ontrack', counts.onTrack, 'On Track', '#1B998B')}
      </div>

      <div className="filters mb-3">
        <input
          type="text"
          className="form-control filter-select"
          placeholder="Search by customer or artist..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="form-select filter-select" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
          <option value="">All urgency</option>
          <option value="overdue">Overdue</option>
          <option value="soon">Due soon</option>
          <option value="ok">On track</option>
          <option value="pending">Awaiting accept</option>
        </select>
      </div>

      <div className="table-responsive">
        <table className="table custom-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Artist</th>
              <th>Deadline</th>
              <th>Time Left</th>
              <th>Extensions</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center">
                  No deadlines to monitor
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const ex = Array.isArray(r.order.extensions) ? r.order.extensions.length : 0;
                return (
                  <tr key={r.id}>
                    <td>{r.id.substring(0, 8)}...</td>
                    <td>{r.order.customerName || 'N/A'}</td>
                    <td>{r.order.artistName || 'N/A'}</td>
                    <td>{r.deadlineMs ? new Date(r.deadlineMs).toLocaleDateString() : '—'}</td>
                    <td>{timePill(r)}</td>
                    <td>
                      {ex > 0 ? (
                        <span className="status-badge" style={{ background: 'rgba(184,92,56,0.10)', color: '#B85C38', border: '1.5px solid rgba(184,92,56,0.45)' }}>
                          {ex}/3 used
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={'status-badge status-' + statusClass(r.order.status)}>{statusLabel(r.order.status)}</span>
                    </td>
                    <td>
                      <button className="btn-action btn-view-paid" onClick={() => openOrder(r.id)}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
