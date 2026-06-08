'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { VerifiedBadge } from '@/components/verified-badge';
import { cn, fmtDate, initials } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Search, UserX, UserCheck, Mail, Phone, Tag } from 'lucide-react';

type Row = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  phone?: string;
  bio?: string;
  category?: string;
  averageRating?: number;
  profileImageUrl?: string;
  emailVerified: boolean;
  createdAt: Date | null;
};

function asDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return null;
}

export default function UsersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'customer' | 'artist' | 'admin'>(
    'all',
  );
  const [selected, setSelected] = useState<Row | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const next: Row[] = snap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          name: (x.name as string) ?? '',
          email: (x.email as string) ?? '',
          role: (x.role as string) ?? 'customer',
          status: (x.status as string) ?? 'active',
          phone: x.phone as string | undefined,
          bio: x.bio as string | undefined,
          category: x.category as string | undefined,
          averageRating:
            typeof x.averageRating === 'number' ? (x.averageRating as number) : undefined,
          profileImageUrl: x.profileImageUrl as string | undefined,
          emailVerified: (x.emailVerified as boolean) ?? false,
          createdAt: asDate(x.createdAt),
        };
      });
      next.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      setRows(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (roleFilter !== 'all' && r.role !== roleFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.phone ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, query, roleFilter]);

  async function setStatus(row: Row, status: 'active' | 'suspended') {
    await updateDoc(doc(db, 'users', row.id), { status });
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
    if (selected?.id === row.id) setSelected({ ...row, status });
  }

  return (
    <div className="px-8 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-slate-500">
            {loading ? 'Loading…' : `${filtered.length} of ${rows.length} users`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, phone"
              className="w-72 pl-8"
            />
          </div>
          <div className="flex rounded-md border border-slate-200 bg-white p-0.5 text-sm">
            {(['all', 'customer', 'artist', 'admin'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={cn(
                  'rounded px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
                  roleFilter === r
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">User</th>
              <th className="px-5 py-3 font-semibold">Email</th>
              <th className="px-5 py-3 font-semibold">Role</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Joined</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-red-600">
                  {error}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">
                  No users match.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setSelected(r)}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      {r.profileImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.profileImageUrl}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                          {initials(r.name || r.email)}
                        </div>
                      )}
                      <div className="font-medium">{r.name || '—'}</div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-700">{r.email}</span>
                      <VerifiedBadge verified={r.emailVerified} compact />
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
                        r.role === 'admin'
                          ? 'bg-purple-50 text-purple-700'
                          : r.role === 'artist'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-slate-100 text-slate-700',
                      )}
                    >
                      {r.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
                        r.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700',
                      )}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{fmtDate(r.createdAt)}</td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(r);
                      }}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <UserDetailDialog
        row={selected}
        onClose={() => setSelected(null)}
        onSuspend={(r) => setStatus(r, 'suspended')}
        onReactivate={(r) => setStatus(r, 'active')}
      />
    </div>
  );
}

function UserDetailDialog({
  row,
  onClose,
  onSuspend,
  onReactivate,
}: {
  row: Row | null;
  onClose: () => void;
  onSuspend: (r: Row) => void;
  onReactivate: (r: Row) => void;
}) {
  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {row && (
          <div className="flex max-h-[90vh] flex-col">
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex items-center gap-4">
                {row.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.profileImageUrl}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-700">
                    {initials(row.name || row.email)}
                  </div>
                )}
                <div className="flex-1">
                  <DialogTitle className="text-lg font-semibold">
                    {row.name || '—'}
                  </DialogTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-500">{row.email}</span>
                    <VerifiedBadge verified={row.emailVerified} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 overflow-y-auto px-6 py-6 md:grid-cols-2">
              <Field icon={Tag} label="Role" value={row.role} />
              <Field icon={UserCheck} label="Status" value={row.status} />
              <Field icon={Mail} label="Email" value={row.email} />
              <Field icon={Phone} label="Phone" value={row.phone || '—'} />
              <Field icon={Tag} label="Category" value={row.category || '—'} />
              <Field
                icon={Tag}
                label="Average rating"
                value={
                  typeof row.averageRating === 'number' ? row.averageRating.toFixed(2) : '—'
                }
              />
              <Field icon={Tag} label="Joined" value={fmtDate(row.createdAt)} />
              <Field icon={Tag} label="UID" value={row.id} mono />
              {row.bio && (
                <div className="md:col-span-2">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Bio
                  </p>
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {row.bio}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
              {row.status === 'active' ? (
                <Button variant="destructive" onClick={() => onSuspend(row)}>
                  <UserX className="h-4 w-4" />
                  Suspend
                </Button>
              ) : (
                <Button onClick={() => onReactivate(row)}>
                  <UserCheck className="h-4 w-4" />
                  Reactivate
                </Button>
              )}
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p
        className={cn(
          'rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800',
          mono && 'font-mono text-xs',
        )}
      >
        {value}
      </p>
    </div>
  );
}
