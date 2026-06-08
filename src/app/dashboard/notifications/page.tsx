'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { asDate, relTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Loader2, Send, Bell, Inbox } from 'lucide-react';

type Notif = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: Date | null;
};

type Broadcast = {
  id: string;
  audience: string;
  title: string;
  message: string;
  recipientCount: number;
  sentAt: Date | null;
};

const TYPE_META: Record<string, { label: string; color: string }> = {
  order_placed: { label: 'Order placed', color: 'bg-blue-50 text-blue-700' },
  order_accepted: { label: 'Order accepted', color: 'bg-emerald-50 text-emerald-700' },
  order_extended: { label: 'Order extended', color: 'bg-amber-50 text-amber-700' },
  order_shipped: { label: 'Order shipped', color: 'bg-indigo-50 text-indigo-700' },
  order_delivered: { label: 'Order delivered', color: 'bg-emerald-50 text-emerald-700' },
  order_cancelled: { label: 'Order cancelled', color: 'bg-red-50 text-red-700' },
  earnings_released: { label: 'Earnings released', color: 'bg-emerald-50 text-emerald-700' },
  rating: { label: 'Rating', color: 'bg-amber-50 text-amber-700' },
  message: { label: 'Message', color: 'bg-slate-100 text-slate-700' },
  broadcast: { label: 'Broadcast', color: 'bg-purple-50 text-purple-700' },
};

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [audience, setAudience] = useState<'all' | 'customers' | 'artists'>('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [notifSnap, broadSnap] = await Promise.all([
        getDocs(query(collection(db, 'notifications'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'broadcasts')),
      ]);
      setNotifs(
        notifSnap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            userId: (x.userId as string) ?? '',
            title: (x.title as string) ?? '',
            message: (x.message as string) ?? '',
            type: (x.type as string) ?? 'message',
            isRead: (x.isRead as boolean) ?? false,
            createdAt: asDate(x.createdAt),
          };
        }),
      );
      const broads: Broadcast[] = broadSnap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          audience: (x.audience as string) ?? 'all',
          title: (x.title as string) ?? '',
          message: (x.message as string) ?? '',
          recipientCount: (x.recipientCount as number) ?? 0,
          sentAt: asDate(x.sentAt),
        };
      });
      broads.sort((a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0));
      setBroadcasts(broads);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const kpis = useMemo(() => {
    let unread = 0;
    notifs.forEach((n) => {
      if (!n.isRead) unread++;
    });
    return {
      total: notifs.length,
      unread,
      broadcasts: broadcasts.length,
    };
  }, [notifs, broadcasts]);

  async function sendBroadcast() {
    setError(null);
    setInfo(null);
    if (!title.trim() || !message.trim()) {
      setError('Title and message are required.');
      return;
    }
    setSending(true);
    try {
      const usersQ =
        audience === 'all'
          ? collection(db, 'users')
          : query(
              collection(db, 'users'),
              where('role', '==', audience === 'customers' ? 'customer' : 'artist'),
            );
      const usersSnap = await getDocs(usersQ);
      const ids = usersSnap.docs.map((d) => d.id);

      // Write per-user notifications in batches of up to 400 to stay safely
      // under the 500-op Firestore batch limit.
      let written = 0;
      for (let i = 0; i < ids.length; i += 400) {
        const slice = ids.slice(i, i + 400);
        const batch = writeBatch(db);
        slice.forEach((uid) => {
          const ref = doc(collection(db, 'notifications'));
          batch.set(ref, {
            userId: uid,
            title: title.trim(),
            message: message.trim(),
            type: 'broadcast',
            isRead: false,
            createdAt: serverTimestamp(),
          });
        });
        await batch.commit();
        written += slice.length;
      }

      await addDoc(collection(db, 'broadcasts'), {
        audience,
        title: title.trim(),
        message: message.trim(),
        recipientCount: written,
        sentAt: serverTimestamp(),
      });

      setInfo(`Sent to ${written} ${audience === 'all' ? 'users' : audience}.`);
      setTitle('');
      setMessage('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send broadcast.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="px-8 py-8">
      <PageHeader title="Notifications" subtitle="Send broadcasts and review the log." />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Notifications" value={kpis.total} icon={Bell} />
        <StatCard label="Unread" value={kpis.unread} icon={Inbox} tone="warning" />
        <StatCard label="Broadcasts sent" value={kpis.broadcasts} icon={Send} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Send form */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Send broadcast
          </h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Audience
              </label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as typeof audience)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm capitalize"
              >
                <option value="all">All users</option>
                <option value="customers">Customers only</option>
                <option value="artists">Artists only</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What's it about?"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                placeholder="Write the announcement here…"
              />
            </div>

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            {info && (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {info}
              </p>
            )}

            <Button disabled={sending} onClick={sendBroadcast} className="w-full">
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Log */}
        <div className="space-y-6 lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                Recent broadcasts
              </h3>
            </div>
            {broadcasts.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                No broadcasts yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {broadcasts.slice(0, 10).map((b) => (
                  <li key={b.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{b.title}</p>
                        <p className="line-clamp-1 text-sm text-slate-500">{b.message}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          to {b.recipientCount} {b.audience}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">{relTime(b.sentAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                Notification log
              </h3>
            </div>
            {loading ? (
              <div className="px-5 py-8 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : notifs.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                No notifications yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifs.slice(0, 30).map((n) => {
                  const meta = TYPE_META[n.type] ?? {
                    label: n.type,
                    color: 'bg-slate-100 text-slate-700',
                  };
                  return (
                    <li key={n.id} className="px-5 py-3">
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
                            meta.color,
                          )}
                        >
                          {meta.label}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{n.title}</p>
                          <p className="line-clamp-1 text-sm text-slate-500">{n.message}</p>
                        </div>
                        <span className="text-xs text-slate-400">{relTime(n.createdAt)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
