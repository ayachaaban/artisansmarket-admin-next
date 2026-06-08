'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageHeader } from '@/components/page-header';
import { SearchInput } from '@/components/search-input';
import { FilterChips } from '@/components/filter-chips';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { asDate, money, statusPillClass } from '@/lib/format';
import { cn, fmtDate } from '@/lib/utils';
import { Loader2, Trash2, RefreshCw, Film, Image as ImageIcon } from 'lucide-react';

type Post = {
  id: string;
  artistId: string;
  artistName: string;
  category: string;
  description: string;
  price: number;
  imageUrl: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  mediaType: string;
  status: string;
  createdAt: Date | null;
};

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'reported' | 'removed' | 'sold'
  >('all');
  const [mediaFilter, setMediaFilter] = useState<'all' | 'post' | 'reel'>('all');
  const [selected, setSelected] = useState<Post | null>(null);

  async function load() {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc')));
      setPosts(
        snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            artistId: (x.artistId as string) ?? '',
            artistName: (x.artistName as string) ?? '',
            category: (x.category as string) ?? '',
            description: (x.description as string) ?? '',
            price: (x.price as number) ?? 0,
            imageUrl: (x.imageUrl as string) ?? '',
            videoUrl: x.videoUrl as string | undefined,
            thumbnailUrl: x.thumbnailUrl as string | undefined,
            mediaType: (x.mediaType as string) ?? 'post',
            status: (x.status as string) ?? 'active',
            createdAt: asDate(x.createdAt),
          };
        }),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return posts.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (mediaFilter !== 'all' && p.mediaType !== mediaFilter) return false;
      if (!s) return true;
      return (
        p.artistName.toLowerCase().includes(s) ||
        p.category.toLowerCase().includes(s) ||
        p.description.toLowerCase().includes(s)
      );
    });
  }, [posts, q, statusFilter, mediaFilter]);

  async function setStatus(p: Post, status: string) {
    await updateDoc(doc(db, 'posts', p.id), { status });
    setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, status } : x)));
    if (selected?.id === p.id) setSelected({ ...p, status });
  }

  async function remove(p: Post) {
    if (!confirm(`Delete this post by ${p.artistName}? This cannot be undone.`)) return;
    await deleteDoc(doc(db, 'posts', p.id));
    setPosts((prev) => prev.filter((x) => x.id !== p.id));
    if (selected?.id === p.id) setSelected(null);
  }

  return (
    <div className="px-8 py-8">
      <PageHeader
        title="Posts"
        subtitle={loading ? 'Loading…' : `${filtered.length} of ${posts.length} posts`}
      >
        <SearchInput value={q} onChange={setQ} placeholder="Search artist, category, description" />
        <FilterChips
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'reported', label: 'Reported' },
            { value: 'removed', label: 'Removed' },
            { value: 'sold', label: 'Sold' },
          ]}
        />
        <FilterChips
          value={mediaFilter}
          onChange={setMediaFilter}
          options={[
            { value: 'all', label: 'All media' },
            { value: 'post', label: 'Posts' },
            { value: 'reel', label: 'Reels' },
          ]}
        />
      </PageHeader>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Media</th>
              <th className="px-5 py-3 font-semibold">Artist</th>
              <th className="px-5 py-3 font-semibold">Category</th>
              <th className="px-5 py-3 font-semibold">Price</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Created</th>
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">
                  No posts match.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setSelected(p)}
                >
                  <td className="px-5 py-3">
                    <div className="relative h-12 w-12 overflow-hidden rounded-md bg-slate-100">
                      {p.imageUrl || p.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.thumbnailUrl || p.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          {p.mediaType === 'reel' ? <Film className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                        </div>
                      )}
                      {p.mediaType === 'reel' && (
                        <span className="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px] font-bold text-white">
                          REEL
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-medium">{p.artistName || '—'}</p>
                    <p className="line-clamp-1 text-xs text-slate-500">{p.description}</p>
                  </td>
                  <td className="px-5 py-3 capitalize text-slate-700">{p.category}</td>
                  <td className="px-5 py-3 text-slate-700">{money(p.price)}</td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
                        statusPillClass(p.status),
                      )}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{fmtDate(p.createdAt)}</td>
                  <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => setSelected(p)}>
                      View
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          {selected && (
            <div className="flex max-h-[90vh] flex-col">
              <div className="border-b border-slate-200 px-6 py-5">
                <DialogTitle className="text-lg font-semibold">Post detail</DialogTitle>
                <p className="mt-1 text-sm text-slate-500">by {selected.artistName}</p>
              </div>
              <div className="grid grid-cols-1 gap-6 overflow-y-auto px-6 py-6 md:grid-cols-2">
                <div>
                  <div className="aspect-square w-full overflow-hidden rounded-lg bg-slate-100">
                    {selected.videoUrl ? (
                      <video src={selected.videoUrl} controls className="h-full w-full object-cover" />
                    ) : selected.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selected.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-400">
                        No media
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <Detail label="Description" value={selected.description || '—'} />
                  <Detail label="Category" value={selected.category} />
                  <Detail label="Price" value={money(selected.price)} />
                  <Detail label="Media type" value={selected.mediaType} />
                  <Detail label="Status" value={selected.status} />
                  <Detail label="Created" value={fmtDate(selected.createdAt)} />
                  <Detail label="Post ID" value={selected.id} mono />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
                {selected.status === 'removed' ? (
                  <Button onClick={() => setStatus(selected, 'active')}>
                    <RefreshCw className="h-4 w-4" />
                    Reactivate
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setStatus(selected, 'removed')}>
                    Remove
                  </Button>
                )}
                <Button variant="destructive" onClick={() => remove(selected)}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
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
