'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Avatar, toDate } from '@/lib/legacy';
import { useDetail } from '@/components/detail-modals';
import { confirmDialog, pushPrompt, toast } from '@/lib/ui';
import { exportPageTable } from '@/lib/export';
import { VerifiedPill } from '@/components/verified-pill';

type UserRow = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
  profileImageUrl?: string;
  emailVerified?: boolean;
  createdAt?: unknown;
};

const PAGE_SIZE = 20;
const ExportIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z" />
    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z" />
  </svg>
);

function roleBadgeClass(role?: string) {
  if (role === 'artist') return 'role-badge role-artist';
  if (role === 'admin' || role === 'super_admin' || role === 'super-admin') return 'role-badge role-admin';
  return 'role-badge role-customer';
}
function roleLabel(role?: string) {
  if (!role) return 'Customer';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function UsersPage() {
  const { openUser } = useDetail();
  const [tab, setTab] = useState<'customers' | 'all'>('customers');
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('createdAt-desc');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [field, dir] = sort.split('-') as [string, 'asc' | 'desc'];
      const base = collection(db, 'users');
      const q =
        tab === 'customers'
          ? query(base, where('role', '==', 'customer'), orderBy(field, dir), limit(500))
          : query(base, orderBy(field, dir), limit(500));
      const snap = await getDocs(q);
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UserRow, 'id'>) })));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab, sort]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [tab, search, sort]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (u) => (u.name || '').toLowerCase().includes(s) || (u.email || '').toLowerCase().includes(s),
    );
  }, [rows, search]);

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
          <td colSpan={7} className="text-center">
            Loading...
          </td>
        </tr>
      );
    if (pageRows.length === 0)
      return (
        <tr>
          <td colSpan={7} className="text-center">
            No {tab === 'customers' ? 'customers' : 'users'} found
          </td>
        </tr>
      );
    return pageRows.map((u) => {
      const status = u.status || 'active';
      const d = toDate(u.createdAt);
      return (
        <tr
          key={u.id}
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            openUser(u.id);
          }}
        >
          <td>
            <Avatar name={u.name} imgUrl={u.profileImageUrl} size={40} />
          </td>
          <td>{u.name || 'N/A'}</td>
          <td>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {u.email || 'N/A'}
              <VerifiedPill verified={u.emailVerified === true} />
            </span>
          </td>
          <td>
            <span className={tab === 'customers' ? 'role-badge role-customer' : roleBadgeClass(u.role)}>
              {tab === 'customers' ? 'Customer' : roleLabel(u.role)}
            </span>
          </td>
          <td>
            <span className={'status-badge status-' + (status === 'active' ? 'active-user' : 'suspended')}>
              {status}
            </span>
          </td>
          <td>{d ? d.toLocaleDateString() : 'N/A'}</td>
          <td>
            {status === 'active' ? (
              <button className="btn-action btn-suspend" onClick={() => suspend(u.id, u.name || 'Unknown')}>
                Suspend
              </button>
            ) : (
              <button className="btn-action btn-activate" onClick={() => activate(u.id, u.name || 'Unknown')}>
                Activate
              </button>
            )}
            <button className="btn-action btn-view" onClick={() => pushPrompt(u.id, u.name || 'user')}>
              Push
            </button>
            <button className="btn-action btn-delete" onClick={() => remove(u.id, u.name || 'Unknown')}>
              Delete
            </button>
          </td>
        </tr>
      );
    });
  };

  return (
    <div className="page-content active" id="usersPage">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="page-title mb-0">Users Management</h2>
        <button className="btn-export" onClick={() => exportPageTable(tab === 'customers' ? 'customers' : 'all-users')}>
          <ExportIcon />
          Export Excel
        </button>
      </div>

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button className={'nav-link' + (tab === 'customers' ? ' active' : '')} onClick={() => setTab('customers')}>
            Customers
          </button>
        </li>
        <li className="nav-item">
          <button className={'nav-link' + (tab === 'all' ? ' active' : '')} onClick={() => setTab('all')}>
            All Users
          </button>
        </li>
      </ul>

      <div className="filters mb-3">
        <input
          type="text"
          className="form-control filter-select"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="form-select filter-select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="createdAt-desc">Newest First</option>
          <option value="createdAt-asc">Oldest First</option>
          <option value="name-asc">Name (A-Z)</option>
          <option value="name-desc">Name (Z-A)</option>
        </select>
      </div>

      <div className="tab-content">
        <div className="tab-pane fade show active">
          <div className="table-responsive">
            <table className="table custom-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
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
              <button
                className="btn-action btn-view"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                className="btn-action btn-view"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
