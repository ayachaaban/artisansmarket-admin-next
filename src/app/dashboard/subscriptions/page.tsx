'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, getDocs, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toDate } from '@/lib/legacy';
import { confirmDialog, toast } from '@/lib/ui';
import { exportPageTable } from '@/lib/export';

type Sub = {
  id: string;
  artistId?: string;
  artistName?: string;
  artistEmail?: string;
  plan?: string;
  amount?: number;
  status?: string;
  expiryDate?: unknown;
};
type Artist = { id: string; name?: string };

const PLANS: Record<string, { name: string; amount: number; limit: string }> = {
  free: { name: 'Free', amount: 0, limit: '5 posts limit' },
  basic: { name: 'Basic', amount: 3.99, limit: '25 posts limit' },
  premium: { name: 'Premium', amount: 9.99, limit: 'Unlimited posts' },
};
const PAGE_SIZE = 20;
const ExportIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z" />
    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z" />
  </svg>
);

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [planF, setPlanF] = useState('');
  const [statusF, setStatusF] = useState('');
  const [page, setPage] = useState(1);
  const [selArtist, setSelArtist] = useState('');
  const [selPlan, setSelPlan] = useState('free');
  const [changingId, setChangingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'subscriptions'));
      setSubs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Sub, 'id'>) })));
    } catch {
      setSubs([]);
    } finally {
      setLoading(false);
    }
    try {
      const a = await getDocs(query(collection(db, 'users'), where('role', '==', 'artist'), orderBy('name', 'asc')));
      setArtists(a.docs.map((d) => ({ id: d.id, name: (d.data().name as string) || 'Unnamed' })));
    } catch {
      setArtists([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [search, planF, statusF]);

  const kpis = useMemo(() => {
    let total = 0, active = 0, expired = 0, revenue = 0;
    subs.forEach((s) => {
      total++;
      if (s.status === 'active') {
        active++;
        revenue += s.amount || 0;
      } else if (s.status === 'expired') expired++;
    });
    return { total, active, expired, revenue };
  }, [subs]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return subs.filter((x) => {
      if (planF && x.plan !== planF) return false;
      if (statusF && x.status !== statusF) return false;
      if (s && !(x.artistName || '').toLowerCase().includes(s) && !(x.artistEmail || '').toLowerCase().includes(s)) return false;
      return true;
    });
  }, [subs, search, planF, statusF]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function assignPlan() {
    if (!selArtist) return toast('Choose an artist first.', 'warning');
    const artist = artists.find((a) => a.id === selArtist);
    const plan = PLANS[selPlan];
    const existing = subs.find((s) => s.artistId === selArtist);
    if (existing) {
      await updateDoc(doc(db, 'subscriptions', existing.id), { plan: selPlan, amount: plan.amount, status: 'active' });
    } else {
      await addDoc(collection(db, 'subscriptions'), {
        artistId: selArtist,
        artistName: artist?.name || '',
        plan: selPlan,
        amount: plan.amount,
        status: 'active',
      });
    }
    load();
    toast('Plan assigned.', 'success');
  }

  async function cancel(id: string, artistName?: string) {
    if (!(await confirmDialog({ title: 'Cancel Subscription', message: `Cancel subscription for "${artistName || 'this artist'}"?`, confirmText: 'Cancel Subscription', type: 'danger', modalClass: 'confirm-modal-delete' }))) return;
    await updateDoc(doc(db, 'subscriptions', id), { status: 'cancelled' });
    toast('Subscription cancelled.', 'success');
    load();
  }

  async function changePlan(id: string, newPlan: string) {
    setChangingId(null);
    const plan = PLANS[newPlan];
    await updateDoc(doc(db, 'subscriptions', id), { plan: newPlan, amount: plan.amount });
    toast(`Plan changed to ${plan.name}.`, 'success');
    load();
  }

  const kpi = (id: string, val: string, label: string, accent: string) => (
    <div className="col-lg-3 col-md-6" key={id}>
      <div className="kpi-card" style={{ borderLeft: `3px solid ${accent}` }}>
        <div className="kpi-details">
          <h4>{val}</h4>
          <p>{label}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-content active" id="subscriptionsPage">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="page-title mb-0">Subscriptions Management</h2>
        <button className="btn-export" onClick={() => exportPageTable('subscriptions')}>
          <ExportIcon />
          Export Excel
        </button>
      </div>

      <div className="row g-3 mb-4">
        {kpi('total', String(kpis.total), 'Total Subscriptions', '#B85C38')}
        {kpi('active', String(kpis.active), 'Active', '#1B998B')}
        {kpi('expired', String(kpis.expired), 'Expired', '#E3A93C')}
        {kpi('rev', '$' + kpis.revenue.toFixed(2), 'Monthly Revenue', '#5B9BB5')}
      </div>

      {/* Plan cards */}
      <div className="row g-3 mb-4">
        {Object.entries(PLANS).map(([key, p]) => (
          <div className="col-lg-4 col-md-6" key={key}>
            <div className="chart-card" style={{ textAlign: 'center', padding: '1.75rem 1.5rem' }}>
              <span className={'plan-badge plan-' + key} style={{ marginBottom: 12, display: 'inline-block' }}>
                {p.name}
              </span>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#2C3E50', margin: '6px 0' }}>
                ${p.amount.toFixed(2).replace('.00', '')}
                <span style={{ fontSize: 16, fontWeight: 500, color: '#8E8E8E' }}>/mo</span>
              </div>
              <div style={{ color: '#8E8E8E', fontSize: 13, marginTop: 8 }}>{p.limit}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Assign plan */}
      <div className="chart-card mb-4">
        <h5 style={{ marginBottom: 16 }}>Assign Plan to Artist</h5>
        <div className="row g-3 align-items-end">
          <div className="col-md-5">
            <label className="form-label" style={{ fontSize: 13, color: '#5C6B73' }}>
              Select Artist
            </label>
            <select className="form-select filter-select" value={selArtist} onChange={(e) => setSelArtist(e.target.value)}>
              <option value="">-- Choose Artist --</option>
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label" style={{ fontSize: 13, color: '#5C6B73' }}>
              Select Plan
            </label>
            <select className="form-select filter-select" value={selPlan} onChange={(e) => setSelPlan(e.target.value)}>
              {Object.entries(PLANS).map(([key, p]) => (
                <option key={key} value={key}>
                  {p.name} (${p.amount}/mo)
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <button
              onClick={assignPlan}
              style={{
                width: '100%',
                padding: '0.6rem 1rem',
                color: '#2E86AB',
                background: 'transparent',
                border: '1.5px solid #2E86AB',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Assign Plan
            </button>
          </div>
        </div>
      </div>

      <div className="filters mb-3">
        <input
          type="text"
          className="form-control filter-select"
          placeholder="Search by artist name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="form-select filter-select" value={planF} onChange={(e) => setPlanF(e.target.value)}>
          <option value="">All Plans</option>
          <option value="free">Free</option>
          <option value="basic">Basic</option>
          <option value="premium">Premium</option>
        </select>
        <select className="form-select filter-select" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="table-responsive">
        <table className="table custom-table">
          <thead>
            <tr>
              <th>Artist</th>
              <th>Email</th>
              <th>Plan</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Expiry Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center">
                  Loading...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center">
                  No subscriptions found
                </td>
              </tr>
            ) : (
              pageRows.map((s) => {
                const d = toDate(s.expiryDate);
                return (
                  <tr key={s.id}>
                    <td>{s.artistName || 'N/A'}</td>
                    <td>{s.artistEmail || 'N/A'}</td>
                    <td>
                      <span className={'plan-badge plan-' + (s.plan || 'free')}>
                        {PLANS[s.plan || 'free']?.name || s.plan}
                      </span>
                    </td>
                    <td>${(s.amount || 0).toFixed(2)}</td>
                    <td>
                      <span className={'status-badge status-' + (s.status || 'active')}>{s.status || 'active'}</span>
                    </td>
                    <td>{d ? d.toLocaleDateString() : 'N/A'}</td>
                    <td>
                      {s.status === 'active' && (
                        <span className="plan-change-wrapper">
                          {changingId === s.id ? (
                            <select
                              className="form-select form-select-sm plan-change-select"
                              defaultValue={s.plan || 'free'}
                              autoFocus
                              onBlur={() => setChangingId(null)}
                              onChange={(e) => {
                                if (e.target.value !== (s.plan || 'free')) changePlan(s.id, e.target.value);
                                else setChangingId(null);
                              }}
                            >
                              {Object.entries(PLANS).map(([key, p]) => (
                                <option key={key} value={key}>
                                  {p.name} (${p.amount}/mo)
                                </option>
                              ))}
                            </select>
                          ) : (
                            <button className="btn-action btn-suspend" onClick={() => setChangingId(s.id)}>
                              Change
                            </button>
                          )}
                          <button className="btn-action btn-delete" onClick={() => cancel(s.id, s.artistName)}>
                            Cancel
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="pagination-controls d-flex justify-content-between align-items-center mt-3">
        <span className="text-muted">
          Page {page} of {totalPages}
        </span>
        <div>
          <button className="btn-action btn-view" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </button>
          <button className="btn-action btn-view" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
