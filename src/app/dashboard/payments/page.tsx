'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, increment, limit, orderBy, query, updateDoc, where } from 'firebase/firestore';
import {
  Area,
  AreaChart,
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
import { toDate } from '@/lib/legacy';
import { confirmDialog, toast } from '@/lib/ui';
import { exportPageTable } from '@/lib/export';

type WalletRow = { id: string; name: string; email: string; balance: number; totalEarnings: number };
type PayoutRow = { id: string; artistName: string; amount: number; status: string; method: string; createdAt: unknown };
const METHOD_COLORS = ['#5B8FA8', '#E8B547', '#7A9B5C', '#D67847', '#B5413B', '#A47A56'];

type Payment = {
  id: string;
  type?: string;
  userName?: string;
  customerName?: string;
  userEmail?: string;
  amount?: number;
  paymentMethod?: string;
  method?: string;
  status?: string;
  createdAt?: unknown;
};

const PAGE_SIZE = 20;
const ExportIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z" />
    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z" />
  </svg>
);

function fmtType(t?: string) {
  const map: Record<string, string> = {
    order: 'Order payment',
    order_payment: 'Order payment',
    refund: 'Refund',
    payout: 'Payout',
    subscription: 'Subscription',
    wallet_credit: 'Wallet credit',
  };
  if (!t) return 'Order payment';
  return map[t] || t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmtMethod(m?: string) {
  if (!m) return 'N/A';
  return m
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
function statusClass(s?: string) {
  const map: Record<string, string> = { completed: 'reviewed', refunded: 'cancelled', pending: 'pending', failed: 'cancelled' };
  return map[s || ''] || 'pending';
}

export default function PaymentsPage() {
  const [tab, setTab] = useState<'payments' | 'payouts' | 'wallets' | 'revenue'>('payments');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, subRevenue: 0, payouts: 0, wallets: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeF, setTypeF] = useState('');
  const [statusF, setStatusF] = useState('');
  const [methodF, setMethodF] = useState('');
  const [page, setPage] = useState(1);
  const [walletRows, setWalletRows] = useState<WalletRow[]>([]);
  const [payoutRows, setPayoutRows] = useState<PayoutRow[]>([]);
  const [walletSearch, setWalletSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pay, payout, subs, wallets, artists] = await Promise.all([
        getDocs(query(collection(db, 'payments'), orderBy('createdAt', 'desc'), limit(500))).catch(
          () => ({ docs: [] }) as never,
        ),
        getDocs(collection(db, 'payouts')).catch(() => ({ docs: [] }) as never),
        getDocs(collection(db, 'subscriptions')).catch(() => ({ docs: [] }) as never),
        getDocs(collection(db, 'wallets')).catch(() => ({ docs: [] }) as never),
        getDocs(query(collection(db, 'users'), where('role', '==', 'artist'))).catch(() => ({ docs: [] }) as never),
      ]);
      const walletMap: Record<string, { balance?: number; totalEarnings?: number }> = {};
      wallets.docs.forEach((d: { id: string; data: () => { balance?: number; totalEarnings?: number } }) => {
        walletMap[d.id] = d.data();
      });
      setWalletRows(
        artists.docs.map((d: { id: string; data: () => { name?: string; email?: string } }) => {
          const a = d.data();
          const w = walletMap[d.id] || {};
          return {
            id: d.id,
            name: a.name || 'Unknown',
            email: a.email || '',
            balance: w.balance || 0,
            totalEarnings: w.totalEarnings || 0,
          };
        }),
      );
      const pays: Payment[] = pay.docs.map((d: { id: string; data: () => Omit<Payment, 'id'> }) => ({ id: d.id, ...d.data() }));
      setPayments(pays);
      let total = 0,
        completed = 0;
      pays.forEach((p) => {
        total++;
        if (p.status === 'completed') completed += p.amount || 0;
      });
      // Resolve artist names for the Payouts tab + KPI sum in one pass.
      const artistName: Record<string, string> = {};
      artists.docs.forEach((d: { id: string; data: () => { name?: string } }) => {
        artistName[d.id] = d.data().name || 'Unknown';
      });
      let payouts = 0;
      const poRows: PayoutRow[] = [];
      payout.docs.forEach((d: { id: string; data: () => { artistId?: string; artistName?: string; status?: string; amount?: number; method?: string; createdAt?: unknown } }) => {
        const x = d.data();
        if (x.status === 'completed') payouts += x.amount || 0;
        poRows.push({
          id: d.id,
          artistName: x.artistName || artistName[x.artistId || ''] || 'Unknown',
          amount: x.amount || 0,
          status: x.status || 'pending',
          method: x.method || 'virtual_visa',
          createdAt: x.createdAt,
        });
      });
      setPayoutRows(poRows);
      let subRevenue = 0;
      subs.docs.forEach((d: { data: () => { status?: string; amount?: number } }) => {
        const s = d.data();
        const st = (s.status || '').toLowerCase();
        if (st === 'active' || st === 'completed' || st === 'paid') subRevenue += s.amount || 0;
      });
      let walletSum = 0;
      wallets.docs.forEach((d: { data: () => { balance?: number } }) => (walletSum += d.data().balance || 0));
      setStats({ total, completed, subRevenue, payouts, wallets: walletSum });
    } catch {
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [search, typeF, statusF, methodF]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return payments.filter((p) => {
      if (typeF && p.type !== typeF) return false;
      if (statusF && p.status !== statusF) return false;
      if (methodF && p.paymentMethod !== methodF && p.method !== methodF) return false;
      if (s && !(p.userName || p.customerName || '').toLowerCase().includes(s) && !(p.userEmail || '').toLowerCase().includes(s))
        return false;
      return true;
    });
  }, [payments, search, typeF, statusF, methodF]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const wallets = useMemo(() => {
    const s = walletSearch.toLowerCase();
    if (!s) return walletRows;
    return walletRows.filter((w) => w.name.toLowerCase().includes(s) || w.email.toLowerCase().includes(s));
  }, [walletRows, walletSearch]);

  const revenueTrend = useMemo(() => {
    // Completed payment revenue grouped by the last 6 months.
    const months: { key: string; label: string; revenue: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: d.getFullYear() + '-' + d.getMonth(),
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        revenue: 0,
      });
    }
    const idx: Record<string, number> = {};
    months.forEach((m, i) => (idx[m.key] = i));
    payments.forEach((p) => {
      if (p.status !== 'completed') return;
      const d = toDate(p.createdAt);
      if (!d) return;
      const k = d.getFullYear() + '-' + d.getMonth();
      if (idx[k] != null) months[idx[k]].revenue += p.amount || 0;
    });
    return months;
  }, [payments]);

  const methodDist = useMemo(() => {
    const counts: Record<string, number> = {};
    payments.forEach((p) => {
      const m = p.paymentMethod || p.method || 'unknown';
      counts[m] = (counts[m] || 0) + 1;
    });
    return Object.entries(counts).map(([k, v], i) => ({ name: fmtMethod(k), value: v, color: METHOD_COLORS[i % METHOD_COLORS.length] }));
  }, [payments]);

  async function addCredit(w: WalletRow) {
    const amt = prompt(`Enter credit amount to add to ${w.name}'s wallet.`);
    if (!amt) return;
    const value = Number(amt);
    if (!value || value <= 0) {
      toast('Enter a valid amount.', 'warning');
      return;
    }
    if (!(await confirmDialog({ title: 'Add Credit', message: `Add $${value.toFixed(2)} to ${w.name}'s wallet?`, confirmText: 'Add Credit', type: 'info' }))) return;
    await updateDoc(doc(db, 'wallets', w.id), { balance: increment(value), totalEarnings: increment(value) }).catch(async () => {
      // wallet doc may not exist yet — create via set semantics
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'wallets', w.id), { balance: value, totalEarnings: value }, { merge: true });
    });
    toast(`Added $${value.toFixed(2)} to ${w.name}'s wallet.`, 'success');
    load();
  }

  const kpi = (id: string, val: string, label: string, accent: string) => (
    <div className="col" key={id}>
      <div className="kpi-card" style={{ borderLeft: `3px solid ${accent}` }}>
        <div className="kpi-details">
          <h4>{val}</h4>
          <p>{label}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-content active" id="paymentsPayoutsPage">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="page-title mb-0">Payments &amp; Payouts</h2>
        <button className="btn-export" onClick={() => exportPageTable(tab === 'payments' ? 'payments' : tab === 'payouts' ? 'payouts' : tab === 'wallets' ? 'artist-wallets' : 'revenue')}>
          <ExportIcon />
          Export Excel
        </button>
      </div>

      {/* Payment policies */}
      <div className="chart-card mb-3">
        <div style={{ fontSize: 13, fontWeight: 700, color: '#2C3E50', marginBottom: 10 }}>Payment Policies</div>
        <div className="d-flex flex-wrap" style={{ gap: 48 }}>
          <div>
            <div style={{ fontSize: 11, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Platform Commission</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2C3E50' }}>0%</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Payout Method</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2C3E50' }}>Auto to Visa</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Currency</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2C3E50' }}>USD (Virtual)</div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="row g-3 mb-4">
        {kpi('total', String(stats.total), 'Total Payments', '#B85C38')}
        {kpi('completed', '$' + stats.completed.toFixed(2), 'Completed', '#1B998B')}
        {kpi('subrev', '$' + stats.subRevenue.toFixed(2), 'Subscription Revenue', '#E3A93C')}
        {kpi('payouts', '$' + stats.payouts.toFixed(2), 'Total Payouts', '#5B9BB5')}
        {kpi('wallets', '$' + stats.wallets.toFixed(2), 'In Wallets', '#A53A33')}
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button className={'nav-link' + (tab === 'payments' ? ' active' : '')} onClick={() => setTab('payments')}>
            Payments
          </button>
        </li>
        <li className="nav-item">
          <button className={'nav-link' + (tab === 'payouts' ? ' active' : '')} onClick={() => setTab('payouts')}>
            Payouts
          </button>
        </li>
        <li className="nav-item">
          <button className={'nav-link' + (tab === 'wallets' ? ' active' : '')} onClick={() => setTab('wallets')}>
            Artist Wallets
          </button>
        </li>
        <li className="nav-item">
          <button className={'nav-link' + (tab === 'revenue' ? ' active' : '')} onClick={() => setTab('revenue')}>
            Revenue Analytics
          </button>
        </li>
      </ul>

      {tab === 'payouts' ? (
        <div className="table-responsive">
          <table className="table custom-table">
            <thead>
              <tr>
                <th>Payout ID</th>
                <th>Artist</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center">Loading...</td></tr>
              ) : payoutRows.length === 0 ? (
                <tr><td colSpan={6} className="text-center">No payouts found</td></tr>
              ) : (
                payoutRows.map((po) => {
                  const d = toDate(po.createdAt);
                  return (
                    <tr key={po.id}>
                      <td>{po.id.substring(0, 8)}...</td>
                      <td>{po.artistName}</td>
                      <td>${po.amount.toFixed(2)}</td>
                      <td>
                        <span className={'payment-method-badge payment-' + po.method}>{fmtMethod(po.method)}</span>
                      </td>
                      <td>
                        <span className={'status-badge status-' + statusClass(po.status)}>{po.status}</span>
                      </td>
                      <td>{d ? d.toLocaleDateString() : 'N/A'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : tab === 'wallets' ? (
        <>
          <div className="filters mb-3">
            <input
              type="text"
              className="form-control filter-select"
              placeholder="Search by artist name or email..."
              value={walletSearch}
              onChange={(e) => setWalletSearch(e.target.value)}
            />
          </div>
          <div className="table-responsive">
            <table className="table custom-table">
              <thead>
                <tr>
                  <th>Artist</th>
                  <th>Email</th>
                  <th>Balance</th>
                  <th>Total Earnings</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center">
                      Loading...
                    </td>
                  </tr>
                ) : wallets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center">
                      No artist wallets found
                    </td>
                  </tr>
                ) : (
                  wallets.map((w) => (
                    <tr key={w.id}>
                      <td>{w.name}</td>
                      <td>{w.email}</td>
                      <td>${w.balance.toFixed(2)}</td>
                      <td>${w.totalEarnings.toFixed(2)}</td>
                      <td>
                        <button className="btn-action btn-approve" onClick={() => addCredit(w)}>
                          Add Credit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === 'revenue' ? (
        <div className="row g-3">
          <div className="col-lg-6">
            <div className="chart-card">
              <h5>Revenue Trend (Last 6 Months)</h5>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={revenueTrend} margin={{ top: 10, right: 10, bottom: 10, left: -10 }}>
                  <CartesianGrid stroke="#eee" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8E8E8E' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#8E8E8E' }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="revenue" stroke="#7A9B5C" fill="#7A9B5C22" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="col-lg-6">
            <div className="chart-card">
              <h5>Payment Methods Distribution</h5>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={methodDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={100} paddingAngle={1}>
                    {methodDist.map((m, i) => (
                      <Cell key={i} fill={m.color} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" iconType="circle" />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="filters mb-3">
            <input
              type="text"
              className="form-control filter-select"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="form-select filter-select" value={typeF} onChange={(e) => setTypeF(e.target.value)}>
              <option value="">All Types</option>
              <option value="order">Order payment</option>
              <option value="refund">Refund</option>
              <option value="payout">Payout</option>
              <option value="subscription">Subscription</option>
            </select>
            <select className="form-select filter-select" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
              <option value="">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
              <option value="failed">Failed</option>
            </select>
            <select className="form-select filter-select" value={methodF} onChange={(e) => setMethodF(e.target.value)}>
              <option value="">All Methods</option>
              <option value="card">Card</option>
              <option value="virtual_visa">Virtual Visa</option>
              <option value="virtual_card">Virtual Card</option>
            </select>
          </div>

          <div className="table-responsive">
            <table className="table custom-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>User</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Date</th>
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
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center">
                      No payments found
                    </td>
                  </tr>
                ) : (
                  pageRows.map((p) => {
                    const d = toDate(p.createdAt);
                    const method = p.paymentMethod || p.method;
                    return (
                      <tr key={p.id}>
                        <td>{p.id.substring(0, 8)}...</td>
                        <td>
                          <span className={'type-badge type-' + (p.type || 'order')}>{fmtType(p.type)}</span>
                        </td>
                        <td>
                          {p.userName || p.customerName || 'N/A'}
                          {p.userEmail && <div style={{ fontSize: 11, color: '#8E8E8E' }}>{p.userEmail}</div>}
                        </td>
                        <td>${(p.amount || 0).toFixed(2)}</td>
                        <td>
                          <span className={'payment-method-badge payment-' + (method || 'unknown')}>{fmtMethod(method)}</span>
                        </td>
                        <td>
                          <span className={'status-badge status-' + statusClass(p.status)}>{p.status || 'pending'}</span>
                        </td>
                        <td>{d ? d.toLocaleDateString() : 'N/A'}</td>
                        <td>
                          <button
                            className="btn-action btn-view-paid"
                            onClick={() => toast(`Payment ${p.id.substring(0, 8)} · ${fmtType(p.type)} · $${(p.amount || 0).toFixed(2)} · ${p.status || 'pending'}`, 'info', 6000)}
                          >
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
        </>
      )}
    </div>
  );
}
