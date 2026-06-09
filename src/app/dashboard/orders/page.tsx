'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { computeAdminCancellation, toDate } from '@/lib/legacy';
import { useDetail } from '@/components/detail-modals';
import { confirmDialog, orderActions, toast } from '@/lib/ui';
import { exportPageTable } from '@/lib/export';

type Order = {
  id: string;
  customerId?: string;
  artistId?: string;
  customerName?: string;
  artistName?: string;
  customerEmail?: string;
  items?: unknown[];
  total?: number;
  totalAmount?: number;
  status?: string;
  paymentMethod?: string;
  method?: string;
  createdAt?: unknown;
};

const PAGE_SIZE = 20;
const ExportIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z" />
    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z" />
  </svg>
);

function statusClass(status?: string) {
  const map: Record<string, string> = {
    pending: 'pending',
    in_progress: 'reported',
    shipping: 'expired',
    delivered: 'reviewed',
    paid: 'active',
    processing: 'reported',
    shipped: 'expired',
    cancelled: 'cancelled',
    refunded: 'removed',
  };
  return map[status || ''] || 'pending';
}
function statusLabel(status?: string) {
  const map: Record<string, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    shipping: 'Shipping',
    delivered: 'Delivered',
    paid: 'Paid',
    processing: 'Processing',
    shipped: 'Shipped',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
  };
  return map[status || ''] || status || 'Unknown';
}
const IN_FLIGHT = ['pending', 'in_progress', 'shipping', 'paid', 'processing', 'shipped'];

export default function OrdersPage() {
  const { openOrder } = useDetail();
  const [all, setAll] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [methodF, setMethodF] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')));
      setAll(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) })));
    } catch {
      setAll([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [search, status, methodF, from, to]);

  const kpis = useMemo(() => {
    let total = 0,
      pending = 0,
      delivered = 0,
      revenue = 0;
    all.forEach((o) => {
      total++;
      if (o.status === 'pending' || o.status === 'paid') pending++;
      if (o.status === 'delivered') delivered++;
      if (o.status !== 'cancelled' && o.status !== 'refunded') revenue += o.total ?? o.totalAmount ?? 0;
    });
    return { total, pending, delivered, revenue };
  }, [all]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    const fromMs = from ? new Date(from).getTime() : null;
    const toMs = to ? new Date(to).getTime() + 86400000 : null;
    return all.filter((o) => {
      if (status && o.status !== status) return false;
      if (methodF && o.paymentMethod !== methodF && o.method !== methodF) return false;
      if (
        s &&
        !(o.customerName || '').toLowerCase().includes(s) &&
        !(o.artistName || '').toLowerCase().includes(s) &&
        !(o.customerEmail || '').toLowerCase().includes(s)
      )
        return false;
      const d = toDate(o.createdAt);
      if (fromMs && (!d || d.getTime() < fromMs)) return false;
      if (toMs && (!d || d.getTime() > toMs)) return false;
      return true;
    });
  }, [all, search, status, methodF, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function update(o: Order) {
    orderActions({ ...o }, load);
  }
  async function cancel(o: Order) {
    const outcome = computeAdminCancellation(o as Record<string, unknown>);
    const refund = +outcome.refund.toFixed(2);
    const artistShare = +outcome.artistShare.toFixed(2);
    const ok = await confirmDialog({
      title: 'Cancel order',
      message: `Tier: ${outcome.tier} Refund to customer: $${refund.toFixed(2)} Artist keeps: $${artistShare.toFixed(2)} Continue?`,
      confirmText: 'Cancel order',
      type: 'danger',
    });
    if (!ok) return;
    await updateDoc(doc(db, 'orders', o.id), {
      status: 'cancelled',
      payoutStatus: 'unpaid',
      refundAmount: refund,
      cancellationArtistShare: artistShare,
      cancellationTier: outcome.tier,
    });
    toast(`Order cancelled. Refund $${refund.toFixed(2)} to customer.`, 'success');
    load();
  }

  const kpiCard = (id: string, val: string, label: string, accent: string) => (
    <div className="col-lg-3 col-md-6" key={id}>
      <div className="kpi-card" style={{ borderLeft: `3px solid ${accent}` }}>
        <div className="kpi-details">
          <h4>{val}</h4>
          <p>{label}</p>
        </div>
      </div>
    </div>
  );

  const renderRows = () => {
    if (loading)
      return (
        <tr>
          <td colSpan={9} className="text-center">
            Loading...
          </td>
        </tr>
      );
    if (pageRows.length === 0)
      return (
        <tr>
          <td colSpan={9} className="text-center">
            No orders found
          </td>
        </tr>
      );
    return pageRows.map((o) => {
      const d = toDate(o.createdAt);
      const notFinal = o.status !== 'refunded' && o.status !== 'cancelled';
      return (
        <tr key={o.id}>
          <td>{o.id.substring(0, 8)}...</td>
          <td>{o.customerName || 'N/A'}</td>
          <td>{o.artistName || 'N/A'}</td>
          <td>{(o.items || []).length} item(s)</td>
          <td>${(o.total ?? o.totalAmount ?? 0).toFixed(2)}</td>
          <td>
            <span className={'status-badge status-' + statusClass(o.status)}>{statusLabel(o.status)}</span>
          </td>
          <td>
            <span className={'payment-method-badge payment-' + (o.paymentMethod || 'stripe')}>
              {o.paymentMethod || 'N/A'}
            </span>
          </td>
          <td>{d ? d.toLocaleDateString() : 'N/A'}</td>
          <td>
            <button className="btn-action btn-view-paid" onClick={() => openOrder(o.id)}>
              View
            </button>
            {IN_FLIGHT.includes(o.status || '') && (
              <button className="btn-action btn-approve" onClick={() => update(o)}>
                Update
              </button>
            )}
            {notFinal && (
              <button className="btn-action btn-delete" onClick={() => cancel(o)}>
                Cancel order
              </button>
            )}
          </td>
        </tr>
      );
    });
  };

  return (
    <div className="page-content active" id="ordersPage">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="page-title mb-0">Orders Management</h2>
        <button className="btn-export" onClick={() => exportPageTable('orders')}>
          <ExportIcon />
          Export Excel
        </button>
      </div>

      <div className="row g-3 mb-4">
        {kpiCard('total', String(kpis.total), 'Total Orders', '#B85C38')}
        {kpiCard('pending', String(kpis.pending), 'Pending', '#F59E0B')}
        {kpiCard('delivered', String(kpis.delivered), 'Delivered', '#3A6B5C')}
        {kpiCard('revenue', '$' + kpis.revenue.toFixed(2), 'Total Revenue', '#5B9BB5')}
      </div>

      <div className="filters mb-3" style={{ alignItems: 'center' }}>
        <input
          type="text"
          className="form-control filter-select"
          placeholder="Search by customer or artist..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="form-select filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="pending">Pending (new)</option>
          <option value="in_progress">In Progress</option>
          <option value="shipping">Shipping</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
          <option value="refunded">Refunded</option>
        </select>
        <select className="form-select filter-select" value={methodF} onChange={(e) => setMethodF(e.target.value)}>
          <option value="">All Methods</option>
          <option value="virtual_card">Virtual Card</option>
          <option value="virtual_visa">Virtual Visa</option>
        </select>
        <span className="text-muted" style={{ fontSize: 13 }}>
          From
        </span>
        <input type="date" className="form-control filter-select" style={{ maxWidth: 170 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-muted" style={{ fontSize: 13 }}>
          To
        </span>
        <input type="date" className="form-control filter-select" style={{ maxWidth: 170 }} value={to} onChange={(e) => setTo(e.target.value)} />
        <button
          className="btn-action btn-view"
          onClick={() => {
            setFrom('');
            setTo('');
          }}
        >
          Clear
        </button>
      </div>

      <div className="table-responsive">
        <table className="table custom-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Artist</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>{renderRows()}</tbody>
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
