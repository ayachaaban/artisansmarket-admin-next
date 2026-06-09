'use client';

import { useCallback, useEffect, useState } from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { confirmDialog, toast } from '@/lib/ui';
import { toDate } from '@/lib/legacy';

type Admin = { id: string; name?: string; email?: string; role?: string; createdAt?: unknown };

function isSuper(role?: string) {
  return role === 'super-admin' || role === 'super_admin';
}

export default function AdminsPage() {
  const { profile } = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'admins'), orderBy('createdAt', 'desc')));
      setAdmins(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Admin, 'id'>) })));
    } catch {
      // createdAt may be missing on some docs — fall back to an unordered read.
      try {
        const snap = await getDocs(collection(db, 'admins'));
        setAdmins(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Admin, 'id'>) })));
      } catch {
        setAdmins([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createAdmin() {
    if (!name.trim() || !email.trim() || password.length < 6) {
      toast('Enter a name, email, and a password of at least 6 characters.', 'warning');
      return;
    }
    setCreating(true);
    // Use a SECONDARY Firebase app so creating the new account does NOT replace
    // the current super-admin's session.
    const secondary = initializeApp(firebaseConfig, 'admin-creator');
    try {
      const secAuth = getAuth(secondary);
      const cred = await createUserWithEmailAndPassword(secAuth, email.trim(), password);
      await setDoc(doc(db, 'admins', cred.user.uid), {
        // Firestore rules only permit creating docs with role 'admin'. Promoting
        // someone to super-admin is a manual step done directly in Firebase.
        name: name.trim(),
        email: email.trim(),
        role: 'admin',
        createdAt: serverTimestamp(),
        createdBy: profile?.email || '',
      });
      await signOut(secAuth);
      toast(`Admin "${name.trim()}" created.`, 'success');
      setName('');
      setEmail('');
      setPassword('');
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create admin.';
      toast(msg.includes('email-already-in-use') ? 'That email already has an account.' : msg, 'error');
    } finally {
      await deleteApp(secondary).catch(() => {});
      setCreating(false);
    }
  }

  async function removeAdmin(a: Admin) {
    if (a.id === profile?.uid) {
      toast('You cannot remove your own admin access.', 'warning');
      return;
    }
    const ok = await confirmDialog({
      title: 'Remove admin',
      message: `Revoke dashboard access for ${a.email || a.name || a.id}? Their login will be blocked.`,
      confirmText: 'Remove',
      type: 'danger',
    });
    if (!ok) return;
    await deleteDoc(doc(db, 'admins', a.id));
    toast('Admin access revoked.', 'success');
    load();
  }

  if (!isSuper(profile?.role)) {
    return (
      <div className="page-content active">
        <h2 className="page-title">Admin Management</h2>
        <div className="chart-card" style={{ textAlign: 'center', padding: 40, color: '#8E8E8E' }}>
          This page is available to super-admins only.
        </div>
      </div>
    );
  }

  return (
    <div className="page-content active" id="adminsPage">
      <h2 className="page-title mb-3">Admin Management</h2>
      <div className="row g-3">
        <div className="col-lg-4">
          <div className="chart-card">
            <h5 style={{ marginBottom: 14 }}>Create admin</h5>
            <div className="mb-3">
              <label className="form-label" style={{ fontSize: 12, color: '#5C6B73' }}>Name</label>
              <input type="text" className="form-control filter-select" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="mb-3">
              <label className="form-label" style={{ fontSize: 12, color: '#5C6B73' }}>Email</label>
              <input type="email" className="form-control filter-select" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
            </div>
            <div className="mb-3">
              <label className="form-label" style={{ fontSize: 12, color: '#5C6B73' }}>Temporary password</label>
              <input type="text" className="form-control filter-select" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" />
            </div>
            <div className="mb-3" style={{ fontSize: 12, color: '#8E8E8E' }}>
              New accounts are created as <strong>Admin</strong>. Promote to super-admin from Firebase if needed.
            </div>
            <button className="btn-action btn-approve" onClick={createAdmin} disabled={creating}>
              {creating ? 'Creating…' : 'Create admin'}
            </button>
          </div>
        </div>

        <div className="col-lg-8">
          <div className="chart-card">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h5 className="mb-0">Admins</h5>
              <span className="text-muted" style={{ fontSize: 12 }}>{admins.length} total</span>
            </div>
            <div className="table-responsive">
              <table className="table custom-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="text-center">Loading...</td></tr>
                  ) : admins.length === 0 ? (
                    <tr><td colSpan={5} className="text-center">No admins found</td></tr>
                  ) : (
                    admins.map((a) => {
                      const d = toDate(a.createdAt);
                      return (
                        <tr key={a.id}>
                          <td>{a.name || '—'}</td>
                          <td>{a.email || '—'}</td>
                          <td>
                            <span className={'role-badge ' + (isSuper(a.role) ? 'role-admin' : 'role-artist')}>
                              {isSuper(a.role) ? 'Super-admin' : 'Admin'}
                            </span>
                          </td>
                          <td>{d ? d.toLocaleDateString() : '—'}</td>
                          <td>
                            <button
                              className="btn-action btn-delete"
                              onClick={() => removeAdmin(a)}
                              disabled={a.id === profile?.uid}
                              title={a.id === profile?.uid ? 'You cannot remove yourself' : 'Revoke access'}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
