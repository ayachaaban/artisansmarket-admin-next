'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Avatar, toDate } from '@/lib/legacy';
import { useDetail } from '@/components/detail-modals';
import { confirmDialog, pushPrompt, toast } from '@/lib/ui';
import { exportPageTable } from '@/lib/export';
import { VerifiedPill } from '@/components/verified-pill';

type Artist = {
  id: string;
  name?: string;
  email?: string;
  category?: string;
  averageRating?: number;
  status?: string;
  profileImageUrl?: string;
  emailVerified?: boolean;
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

export default function ArtistsPage() {
  const { openUser } = useDetail();
  const [rows, setRows] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('createdAt-desc');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [field, dir] = sort.split('-') as [string, 'asc' | 'desc'];
      const snap = await getDocs(
        query(collection(db, 'users'), where('role', '==', 'artist'), orderBy(field, dir), limit(500)),
      );
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Artist, 'id'>) })));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [sort]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [search, category, sort]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return rows.filter((a) => {
      if (category && a.category !== category) return false;
      if (s && !(a.name || '').toLowerCase().includes(s) && !(a.email || '').toLowerCase().includes(s)) return false;
      return true;
    });
  }, [rows, search, category]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function suspend(id: string, name: string) {
    if (!(await confirmDialog({ title: 'Suspend User', message: `Suspend user "${name}"?`, confirmText: 'Suspend', modalClass: 'confirm-modal-suspend' }))) return;
    await updateDoc(doc(db, 'users', id), { status: 'suspended' });
    toast(`User "${name}" suspended.`, 'warning');
    load();
  }
  async function activate(id: string, name: string) {
    if (!(await confirmDialog({ title: 'Activate User', message: `Activate user "${name}"?`, confirmText: 'Activate', type: 'info' }))) return;
    await updateDoc(doc(db, 'users', id), { status: 'active' });
    toast(`User "${name}" activated.`, 'success');
    load();
  }
  async function remove(id: string, name: string) {
    if (!(await confirmDialog({ title: 'Delete User', message: `Delete user "${name}"? This cannot be undone.`, confirmText: 'Delete', type: 'danger', modalClass: 'confirm-modal-delete' }))) return;
    await deleteDoc(doc(db, 'users', id));
    toast(`User "${name}" deleted.`, 'success');
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
            No artists found
          </td>
        </tr>
      );
    return pageRows.map((a) => {
      const status = a.status || 'active';
      const d = toDate(a.createdAt);
      return (
        <tr
          key={a.id}
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            openUser(a.id);
          }}
        >
          <td>
            <Avatar name={a.name} imgUrl={a.profileImageUrl} size={40} />
          </td>
          <td>{a.name || 'N/A'}</td>
          <td>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {a.email || 'N/A'}
              <VerifiedPill verified={a.emailVerified === true} />
            </span>
          </td>
          <td>{a.category || 'N/A'}</td>
          <td>{a.averageRating ? a.averageRating.toFixed(1) : 'N/A'}</td>
          <td>
            <span className={'status-badge status-' + (status === 'active' ? 'active-user' : 'suspended')}>{status}</span>
          </td>
          <td>{d ? d.toLocaleDateString() : 'N/A'}</td>
          <td>
            {status === 'active' ? (
              <button className="btn-action btn-suspend" onClick={() => suspend(a.id, a.name || 'Unknown')}>
                Suspend
              </button>
            ) : (
              <button className="btn-action btn-activate" onClick={() => activate(a.id, a.name || 'Unknown')}>
                Activate
              </button>
            )}
            <button className="btn-action btn-view" onClick={() => pushPrompt(a.id, a.name || 'artist')}>
              Push
            </button>
            <button className="btn-action btn-delete" onClick={() => remove(a.id, a.name || 'Unknown')}>
              Delete
            </button>
          </td>
        </tr>
      );
    });
  };

  return (
    <div className="page-content active" id="artistsPage">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="page-title mb-0">Artists Management</h2>
        <button className="btn-export" onClick={() => exportPageTable('artists')}>
          <ExportIcon />
          Export Excel
        </button>
      </div>

      <div className="filters mb-3">
        <input
          type="text"
          className="form-control filter-select"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="form-select filter-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="form-select filter-select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="createdAt-desc">Newest First</option>
          <option value="createdAt-asc">Oldest First</option>
          <option value="name-asc">Name (A-Z)</option>
          <option value="name-desc">Name (Z-A)</option>
        </select>
      </div>

      <div className="table-responsive">
        <table className="table custom-table">
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Email</th>
              <th>Category</th>
              <th>Average Rating</th>
              <th>Status</th>
              <th>Joined Date</th>
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
