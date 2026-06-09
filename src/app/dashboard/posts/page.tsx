'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toDate } from '@/lib/legacy';
import { useDetail } from '@/components/detail-modals';
import { confirmDialog, toast } from '@/lib/ui';
import { exportPageTable } from '@/lib/export';

type Post = {
  id: string;
  artistId?: string;
  artistName?: string;
  category?: string;
  description?: string;
  status?: string;
  mediaType?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  videoDurationSec?: number;
  createdAt?: unknown;
};

const PAGE_SIZE = 20;
const CATEGORIES = [
  'Painting', 'Sculpture', 'Photography', 'Digital Art', 'Crafts', 'Pottery', 'Jewelry',
  'Woodwork', 'Textiles', 'Knitting & Crochet', 'Leather', 'Glasswork', 'Calligraphy',
  'Illustration', 'Printmaking', 'Metalwork', 'Candles & Soap', 'Mosaic', 'Embroidery',
  'Paper Art', 'Resin Art', 'Mixed Media',
];
const ExportIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z" />
    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z" />
  </svg>
);

export default function PostsPage() {
  const { openPost } = useDetail();
  const [all, setAll] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [media, setMedia] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(500)));
      setAll(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, 'id'>) })));
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
  }, [category, status, media, search, from, to]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    const fromMs = from ? new Date(from).getTime() : null;
    const toMs = to ? new Date(to).getTime() + 86400000 : null;
    return all.filter((p) => {
      if (category && p.category !== category) return false;
      if (status && p.status !== status) return false;
      if (media && p.mediaType !== media) return false;
      if (s && !(p.artistName || '').toLowerCase().includes(s)) return false;
      const d = toDate(p.createdAt);
      if (fromMs && (!d || d.getTime() < fromMs)) return false;
      if (toMs && (!d || d.getTime() > toMs)) return false;
      return true;
    });
  }, [all, category, status, media, search, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function remove(id: string) {
    if (!(await confirmDialog({ title: 'Delete Post', message: 'Delete this post? This cannot be undone.', confirmText: 'Delete', type: 'danger' }))) return;
    await deleteDoc(doc(db, 'posts', id));
    toast('Post deleted.', 'success');
    load();
  }

  // Soft moderation: hide a post from the marketplace (status='removed') and
  // notify the artist, or restore it (status='active'). Mirrors the mobile app,
  // which filters on status and shows a removed-state to the artist.
  async function setPostStatus(p: Post, newStatus: 'removed' | 'active') {
    const removing = newStatus === 'removed';
    const ok = await confirmDialog({
      title: removing ? 'Remove Post' : 'Reactivate Post',
      message: removing
        ? 'Hide this post from the marketplace and notify the artist?'
        : 'Make this post visible in the marketplace again?',
      confirmText: removing ? 'Remove' : 'Reactivate',
      type: removing ? 'danger' : 'info',
    });
    if (!ok) return;
    await updateDoc(doc(db, 'posts', p.id), { status: newStatus });
    if (removing && p.artistId) {
      await addDoc(collection(db, 'notifications'), {
        userId: p.artistId,
        title: 'Post removed',
        message: 'One of your posts was removed by an administrator for review.',
        type: 'post_removed',
        referenceId: p.id,
        isRead: false,
        createdAt: serverTimestamp(),
      });
    }
    toast(removing ? 'Post removed.' : 'Post reactivated.', 'success');
    load();
  }

  const renderRows = () => {
    if (loading)
      return (
        <tr>
          <td colSpan={8} className="text-center">
            Loading...
          </td>
        </tr>
      );
    if (pageRows.length === 0)
      return (
        <tr>
          <td colSpan={8} className="text-center">
            No posts found
          </td>
        </tr>
      );
    return pageRows.map((p) => {
      const isReel = p.mediaType === 'reel';
      const src = isReel
        ? p.thumbnailUrl || p.imageUrl || 'https://via.placeholder.com/60'
        : p.imageUrl || 'https://via.placeholder.com/60';
      const desc =
        p.description && p.description.length > 40 ? p.description.substring(0, 40) + '...' : p.description || 'N/A';
      const d = toDate(p.createdAt);
      return (
        <tr
          key={p.id}
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            openPost(p.id);
          }}
        >
          <td>
            <div style={{ position: 'relative', width: 60, height: 60, borderRadius: 6, overflow: 'hidden', background: '#f0f0f0' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={isReel ? 'Reel' : 'Post'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {isReel && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 22 }}>
                  ▶
                </div>
              )}
            </div>
          </td>
          <td>
            <span
              className="status-badge"
              style={isReel ? { background: 'rgba(139,92,246,0.15)', color: '#8B5CF6' } : { background: 'rgba(46,134,171,0.15)', color: '#2E86AB' }}
            >
              {isReel ? 'Reel' : 'Post'}
            </span>
          </td>
          <td>{p.artistName || 'Unknown'}</td>
          <td>{p.category || 'N/A'}</td>
          <td>{desc}</td>
          <td>
            <span className={'status-badge status-' + (p.status || 'active')}>{p.status || 'active'}</span>
          </td>
          <td>{d ? d.toLocaleDateString() : 'N/A'}</td>
          <td>
            {p.status === 'removed' ? (
              <button className="btn-action btn-approve" onClick={() => setPostStatus(p, 'active')}>
                Reactivate
              </button>
            ) : (
              <button className="btn-action btn-view" onClick={() => setPostStatus(p, 'removed')}>
                Remove
              </button>
            )}
            <button className="btn-action btn-delete" onClick={() => remove(p.id)}>
              Delete
            </button>
          </td>
        </tr>
      );
    });
  };

  return (
    <div className="page-content active" id="postsPage">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="page-title mb-0">Posts Management</h2>
        <button className="btn-export" onClick={() => exportPageTable('posts')}>
          <ExportIcon />
          Export Excel
        </button>
      </div>

      <div className="filters">
        <select className="form-select filter-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="form-select filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="reported">Reported</option>
          <option value="removed">Removed</option>
        </select>
        <select className="form-select filter-select" value={media} onChange={(e) => setMedia(e.target.value)}>
          <option value="">All Media</option>
          <option value="post">Posts (images)</option>
          <option value="reel">Reels (videos)</option>
        </select>
        <input
          type="text"
          className="form-control filter-select"
          placeholder="Search by artist name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="date-filter-bar filters" style={{ alignItems: 'center' }}>
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
              <th>Media</th>
              <th>Type</th>
              <th>Artist Name</th>
              <th>Category</th>
              <th>Description</th>
              <th>Status</th>
              <th>Created At</th>
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
