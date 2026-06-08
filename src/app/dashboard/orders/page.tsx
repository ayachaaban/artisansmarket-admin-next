'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageHeader } from '@/components/page-header';
import { SearchInput } from '@/components/search-input';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/stat-card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { asDate, money, statusPillClass } from '@/lib/format';
import { cn, fmtDate } from '@/lib/utils';
import { Loader2, ShoppingBag, CheckCircle2, Clock, DollarSign } from 'lucide-react';

type OrderItem = { name?: string; quantity?: number; price?: number; postId?: string };
type DeliveryAddress = {
  street?: string;
  building?: string;
  apartment?: string;
  nickname?: string;
  phone?: string;
  instructions?: string;
  resolvedAddress?: string;
  lat?: number;
  lng?: number;
};
type Order = {
  id: string;
  customerId: string;
  customerName: string;
  artistId: string;
  artistName: string;
  items: OrderItem[];
  total: number;
  subtotal?: number;
  platformFee?: number;
  status: string;
  paymentMethod?: string;
  deliveryAddress?: DeliveryAddress | string;
  estimatedCompletionDate?: Date | null;
  refundAmount?: number;
  createdAt: Date | null;
};

function formatAddress(a: DeliveryAddress | string | undefined): string {
  if (!a) return '—';
  if (typeof a === 'string') return a;
  if (a.resolvedAddress) return a.resolvedAddress;
  const parts = [a.street, a.building, a.apartment, a.nickname].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [selected, setSelected] = useState<Order | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'orders'), orderBy('createdAt', 'desc')),
        );
        setOrders(
          snap.docs.map((d) => {
            const x = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              customerId: (x.customerId as string) ?? '',
              customerName: (x.customerName as string) ?? '',
              artistId: (x.artistId as string) ?? '',
              artistName: (x.artistName as string) ?? '',
              items: (x.items as OrderItem[]) ?? [],
              total: (x.total as number) ?? 0,
              subtotal: x.subtotal as number | undefined,
              platformFee: x.platformFee as number | undefined,
              status: (x.status as string) ?? 'pending',
              paymentMethod: x.paymentMethod as string | undefined,
              deliveryAddress: x.deliveryAddress as DeliveryAddress | string | undefined,
              estimatedCompletionDate: asDate(x.estimatedCompletionDate),
              refundAmount: x.refundAmount as number | undefined,
              createdAt: asDate(x.createdAt),
            };
          }),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (methodFilter !== 'all' && o.paymentMethod !== methodFilter) return false;
      if (!s) return true;
      return (
        o.customerName.toLowerCase().includes(s) ||
        o.artistName.toLowerCase().includes(s) ||
        o.id.toLowerCase().includes(s)
      );
    });
  }, [orders, q, statusFilter, methodFilter]);

  const kpis = useMemo(() => {
    let pending = 0;
    let delivered = 0;
    let revenue = 0;
    orders.forEach((o) => {
      if (o.status === 'pending') pending++;
      if (o.status === 'delivered') delivered++;
      if (['delivered', 'shipping', 'in_progress', 'shipped', 'paid', 'processing'].includes(o.status)) {
        revenue += o.total || 0;
      }
    });
    return { total: orders.length, pending, delivered, revenue };
  }, [orders]);

  const allStatuses = useMemo(() => {
    const s = new Set(orders.map((o) => o.status));
    return Array.from(s);
  }, [orders]);

  const allMethods = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) => o.paymentMethod && s.add(o.paymentMethod));
    return Array.from(s);
  }, [orders]);

  return (
    <div className="px-8 py-8">
      <PageHeader
        title="Orders"
        subtitle={loading ? 'Loading…' : `${filtered.length} of ${orders.length} orders`}
      >
        <SearchInput value={q} onChange={setQ} placeholder="Customer, artist, ID" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm capitalize"
        >
          <option value="all">All status</option>
          {allStatuses.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm capitalize"
        >
          <option value="all">All methods</option>
          {allMethods.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total orders" value={kpis.total} icon={ShoppingBag} />
        <StatCard label="Pending" value={kpis.pending} icon={Clock} tone="warning" />
        <StatCard label="Delivered" value={kpis.delivered} icon={CheckCircle2} tone="success" />
        <StatCard label="Revenue" value={money(kpis.revenue)} icon={DollarSign} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Order</th>
              <th className="px-5 py-3 font-semibold">Customer</th>
              <th className="px-5 py-3 font-semibold">Artist</th>
              <th className="px-5 py-3 font-semibold">Items</th>
              <th className="px-5 py-3 font-semibold">Total</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Method</th>
              <th className="px-5 py-3 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500">
                  No orders match.
                </td>
              </tr>
            ) : (
              filtered.map((o) => (
                <tr
                  key={o.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setSelected(o)}
                >
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">
                    {o.id.slice(0, 8)}…
                  </td>
                  <td className="px-5 py-3">{o.customerName || '—'}</td>
                  <td className="px-5 py-3">{o.artistName || '—'}</td>
                  <td className="px-5 py-3 text-slate-700">{o.items.length}</td>
                  <td className="px-5 py-3 font-semibold">{money(o.total)}</td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
                        statusPillClass(o.status),
                      )}
                    >
                      {o.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3 capitalize text-slate-700">{o.paymentMethod || '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{fmtDate(o.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          {selected && (
            <div className="flex max-h-[90vh] flex-col">
              <div className="border-b border-slate-200 px-6 py-5">
                <DialogTitle className="text-lg font-semibold">
                  Order {selected.id.slice(0, 12)}…
                </DialogTitle>
                <p className="mt-1 text-sm text-slate-500">
                  {selected.customerName} → {selected.artistName}
                </p>
              </div>
              <div className="overflow-y-auto px-6 py-6">
                <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Detail label="Status" value={selected.status.replace(/_/g, ' ')} />
                  <Detail label="Total" value={money(selected.total)} />
                  <Detail label="Subtotal" value={money(selected.subtotal ?? 0)} />
                  <Detail label="Platform fee" value={money(selected.platformFee ?? 0)} />
                  <Detail label="Payment method" value={selected.paymentMethod ?? '—'} />
                  <Detail label="Delivery address" value={formatAddress(selected.deliveryAddress)} />
                  <Detail label="Created" value={fmtDate(selected.createdAt)} />
                  <Detail
                    label="Est. completion"
                    value={fmtDate(selected.estimatedCompletionDate)}
                  />
                </div>

                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                  Items
                </h3>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selected.items.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                            No items
                          </td>
                        </tr>
                      ) : (
                        selected.items.map((it, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2">{it.name ?? '—'}</td>
                            <td className="px-3 py-2">{it.quantity ?? 1}</td>
                            <td className="px-3 py-2">{money(it.price ?? 0)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 capitalize">
        {value}
      </p>
    </div>
  );
}
