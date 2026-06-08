'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageHeader } from '@/components/page-header';
import { FilterChips } from '@/components/filter-chips';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { asDate, statusPillClass } from '@/lib/format';
import { cn, fmtDate } from '@/lib/utils';
import { Loader2, CheckCircle2, Trash2, Image as ImageIcon } from 'lucide-react';

type Report = {
  id: string;
  reporterId: string;
  reporterName?: string;
  postId: string;
  reason: string;
  description?: string;
  status: string;
  createdAt: Date | null;
};

type LinkedPost = {
  id: string;
  artistName: string;
  description: string;
  imageUrl: string;
  thumbnailUrl?: string;
  category: string;
  status: string;
};

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed'>('all');
  const [selected, setSelected] = useState<Report | null>(null);
  const [linkedPost, setLinkedPost] = useState<LinkedPost | null>(null);
  const [loadingPost, setLoadingPost] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'reports'), orderBy('createdAt', 'desc')),
        );
        setReports(
          snap.docs.map((d) => {
            const x = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              reporterId: (x.reporterId as string) ?? '',
              reporterName: x.reporterName as string | undefined,
              postId: (x.postId as string) ?? '',
              reason: (x.reason as string) ?? '',
              description: x.description as string | undefined,
              status: (x.status as string) ?? 'pending',
              createdAt: asDate(x.createdAt),
            };
          }),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    setLinkedPost(null);
    if (!selected) return;
    setLoadingPost(true);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'posts', selected.postId));
        if (snap.exists()) {
          const x = snap.data() as Record<string, unknown>;
          setLinkedPost({
            id: snap.id,
            artistName: (x.artistName as string) ?? '',
            description: (x.description as string) ?? '',
            imageUrl: (x.imageUrl as string) ?? '',
            thumbnailUrl: x.thumbnailUrl as string | undefined,
            category: (x.category as string) ?? '',
            status: (x.status as string) ?? 'active',
          });
        }
      } finally {
        setLoadingPost(false);
      }
    })();
  }, [selected]);

  const filtered = useMemo(
    () => (filter === 'all' ? reports : reports.filter((r) => r.status === filter)),
    [reports, filter],
  );

  async function markResolved(r: Report) {
    await updateDoc(doc(db, 'reports', r.id), { status: 'reviewed' });
    setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: 'reviewed' } : x)));
    if (selected?.id === r.id) setSelected({ ...r, status: 'reviewed' });
  }

  async function removePost(r: Report) {
    if (!confirm('Mark the reported post as removed?')) return;
    await updateDoc(doc(db, 'posts', r.postId), { status: 'removed' });
    await updateDoc(doc(db, 'reports', r.id), { status: 'reviewed' });
    setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: 'reviewed' } : x)));
    if (linkedPost) setLinkedPost({ ...linkedPost, status: 'removed' });
    if (selected?.id === r.id) setSelected({ ...r, status: 'reviewed' });
  }

  return (
    <div className="px-8 py-8">
      <PageHeader
        title="Reports"
        subtitle={loading ? 'Loading…' : `${filtered.length} of ${reports.length} reports`}
      >
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'pending', label: 'Pending' },
            { value: 'reviewed', label: 'Reviewed' },
          ]}
        />
      </PageHeader>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Post ID</th>
              <th className="px-5 py-3 font-semibold">Reporter</th>
              <th className="px-5 py-3 font-semibold">Reason</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Created</th>
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">
                  No reports.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setSelected(r)}
                >
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">
                    {r.postId.slice(0, 8)}…
                  </td>
                  <td className="px-5 py-3">{r.reporterName || r.reporterId.slice(0, 8)}</td>
                  <td className="px-5 py-3 line-clamp-1 text-slate-700">{r.reason}</td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
                        statusPillClass(r.status),
                      )}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{fmtDate(r.createdAt)}</td>
                  <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => setSelected(r)}>
                      View
                    </Button>
                  </td>
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
                <DialogTitle className="text-lg font-semibold">Report detail</DialogTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Reported {fmtDate(selected.createdAt)}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-6 overflow-y-auto px-6 py-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Reported post
                  </h3>
                  {loadingPost ? (
                    <div className="flex h-48 items-center justify-center rounded-lg bg-slate-100">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                  ) : linkedPost ? (
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <div className="aspect-square w-full bg-slate-100">
                        {linkedPost.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={linkedPost.thumbnailUrl || linkedPost.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-400">
                            <ImageIcon className="h-8 w-8" />
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-semibold">{linkedPost.artistName || '—'}</p>
                        <p className="line-clamp-2 text-xs text-slate-500">
                          {linkedPost.description}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize">
                            {linkedPost.category}
                          </span>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
                              statusPillClass(linkedPost.status),
                            )}
                          >
                            {linkedPost.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
                      Post not found (may already be deleted).
                    </p>
                  )}
                </div>

                <div className="space-y-3 text-sm">
                  <Detail label="Reason" value={selected.reason} />
                  {selected.description && (
                    <Detail label="Description" value={selected.description} />
                  )}
                  <Detail label="Reporter" value={selected.reporterName || '—'} />
                  <Detail label="Reporter ID" value={selected.reporterId} mono />
                  <Detail label="Post ID" value={selected.postId} mono />
                  <Detail label="Status" value={selected.status} />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
                {linkedPost && linkedPost.status !== 'removed' && (
                  <Button variant="destructive" onClick={() => removePost(selected)}>
                    <Trash2 className="h-4 w-4" />
                    Remove post
                  </Button>
                )}
                {selected.status !== 'reviewed' && (
                  <Button onClick={() => markResolved(selected)}>
                    <CheckCircle2 className="h-4 w-4" />
                    Mark resolved
                  </Button>
                )}
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

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
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
