'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toDate } from '@/lib/legacy';
import { useDetail } from '@/components/detail-modals';
import { confirmDialog, toast } from '@/lib/ui';
import { exportPageTable } from '@/lib/export';

type Report = {
  id: string;
  postId?: string;
  reporterId?: string;
  reason?: string;
  status?: string;
  createdAt?: unknown;
  postImg?: string;
  reporterName?: string;
};

const PAGE_SIZE = 20;
const ExportIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z" />
    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z" />
  </svg>
);

export default function ReportsPage() {
  const { openReport } = useDetail();
  const [all, setAll] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(500)));
      const reports = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Report, 'id'>) }));
      const postIds = [...new Set(reports.map((r) => r.postId).filter(Boolean))] as string[];
      const reporterIds = [...new Set(reports.map((r) => r.reporterId).filter(Boolean))] as string[];
      const [posts, reporters] = await Promise.all([
        Promise.all(postIds.map((id) => getDoc(doc(db, 'posts', id)))),
        Promise.all(reporterIds.map((id) => getDoc(doc(db, 'users', id)))),
      ]);
      const postMap: Record<string, string> = {};
      posts.forEach((d) => {
        if (d.exists()) postMap[d.id] = (d.data().imageUrl as string) || '';
      });
      const repMap: Record<string, string> = {};
      reporters.forEach((d) => {
        if (d.exists()) repMap[d.id] = (d.data().name as string) || 'Unknown';
      });
      setAll(
        reports.map((r) => ({
          ...r,
          postImg: r.postId ? postMap[r.postId] : undefined,
          reporterName: r.reporterId ? repMap[r.reporterId] : undefined,
        })),
      );
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
  }, [status, from, to]);

  const filtered = useMemo(() => {
    const fromMs = from ? new Date(from).getTime() : null;
    const toMs = to ? new Date(to).getTime() + 86400000 : null;
    return all.filter((r) => {
      if (status && r.status !== status) return false;
      const d = toDate(r.createdAt);
      if (fromMs && (!d || d.getTime() < fromMs)) return false;
      if (toMs && (!d || d.getTime() > toMs)) return false;
      return true;
    });
  }, [all, status, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function approve(r: Report) {
    if (!r.postId) return toast('Cannot approve: this report has no associated post.', 'error');
    if (!(await confirmDialog({ title: 'Approve Report', message: 'This will remove the reported post. Continue?', confirmText: 'Approve', type: 'danger', modalClass: 'confirm-modal-approve' }))) return;
    await updateDoc(doc(db, 'posts', r.postId), { status: 'removed' });
    await updateDoc(doc(db, 'reports', r.id), { status: 'reviewed' });
    toast('Report approved. Post removed.', 'success');
    load();
  }
  async function reject(r: Report) {
    if (!(await confirmDialog({ title: 'Reject Report', message: 'Mark report as reviewed without action?', confirmText: 'Reject', modalClass: 'confirm-modal-reject' }))) return;
    await updateDoc(doc(db, 'reports', r.id), { status: 'reviewed' });
    toast('Report rejected.', 'info');
    load();
  }

  const renderRows = () => {
    if (loading)
      return (
        <tr>
          <td colSpan={6} className="text-center">
            Loading...
          </td>
        </tr>
      );
    if (pageRows.length === 0)
      return (
        <tr>
          <td colSpan={6} className="text-center">
            No reports found
          </td>
        </tr>
      );
    return pageRows.map((r) => {
      const d = toDate(r.createdAt);
      return (
        <tr
          key={r.id}
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            openReport(r.id);
          }}
        >
          <td>
            {r.postImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="post-thumbnail" src={r.postImg} alt="Post" />
            ) : (
              'N/A'
            )}
          </td>
          <td>{r.reporterName || 'Unknown'}</td>
          <td>{r.reason || 'No reason'}</td>
          <td>
            <span className={'status-badge status-' + (r.status || 'pending')}>{r.status || 'pending'}</span>
          </td>
          <td>{d ? d.toLocaleDateString() : 'N/A'}</td>
          <td>
            {r.status === 'pending' ? (
              <>
                <button className="btn-action btn-approve" onClick={() => approve(r)}>
                  Approve
                </button>
                <button className="btn-action btn-reject" onClick={() => reject(r)}>
                  Reject
                </button>
              </>
            ) : (
              <span className="text-muted">Reviewed</span>
            )}
          </td>
        </tr>
      );
    });
  };

  return (
    <div className="page-content active" id="reportsPage">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="page-title mb-0">Reports Management</h2>
        <button className="btn-export" onClick={() => exportPageTable('reports')}>
          <ExportIcon />
          Export Excel
        </button>
      </div>

      <div className="filters mb-3" style={{ alignItems: 'center' }}>
        <select className="form-select filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="reviewed">Reviewed</option>
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
              <th>Post</th>
              <th>Reporter</th>
              <th>Reason</th>
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
