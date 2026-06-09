'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Avatar, money, toDate } from '@/lib/legacy';
import { confirmDialog, pushPrompt, toast } from '@/lib/ui';

/* ---------------- helpers ---------------- */
function fmtDate(ts: unknown) {
  const d = toDate(ts);
  return d ? d.toLocaleDateString() : '—';
}
function fmtDateTime(ts: unknown) {
  const d = toDate(ts);
  return d ? d.toLocaleString() : '—';
}
const ORDER_STATUS_CLASS: Record<string, string> = {
  pending: 'pending', in_progress: 'reported', shipping: 'expired', delivered: 'reviewed',
  paid: 'active', processing: 'reported', shipped: 'expired', cancelled: 'cancelled', refunded: 'removed',
};
const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', in_progress: 'In Progress', shipping: 'Shipping', delivered: 'Delivered',
  paid: 'Paid', processing: 'Processing', shipped: 'Shipped', cancelled: 'Cancelled', refunded: 'Refunded',
};
const oClass = (s?: string) => ORDER_STATUS_CLASS[s || ''] || 'pending';
const oLabel = (s?: string) => ORDER_STATUS_LABEL[s || ''] || s || 'Unknown';
type Doc = Record<string, unknown>;

/* ---------------- context ---------------- */
type Detail = { kind: 'user' | 'post' | 'report' | 'order'; id: string };
type Ctx = {
  openUser: (id: string) => void;
  openPost: (id: string) => void;
  openReport: (id: string) => void;
  openOrder: (id: string) => void;
  close: () => void;
};
const DetailCtx = createContext<Ctx | null>(null);
export function useDetail() {
  const v = useContext(DetailCtx);
  if (!v) throw new Error('useDetail must be used within DetailProvider');
  return v;
}

export function DetailProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<Detail | null>(null);
  const openUser = (id: string) => setActive({ kind: 'user', id });
  const openPost = (id: string) => setActive({ kind: 'post', id });
  const openReport = (id: string) => setActive({ kind: 'report', id });
  const openOrder = (id: string) => setActive({ kind: 'order', id });
  const close = () => setActive(null);

  return (
    <DetailCtx.Provider value={{ openUser, openPost, openReport, openOrder, close }}>
      {children}
      {active?.kind === 'user' && <UserDetail id={active.id} />}
      {active?.kind === 'post' && <PostDetail id={active.id} />}
      {active?.kind === 'report' && <ReportDetail id={active.id} />}
      {active?.kind === 'order' && <OrderDetail id={active.id} />}
    </DetailCtx.Provider>
  );
}

/* ---------------- modal shell ---------------- */
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);
  return (
    <div className="detail-modal-overlay active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="detail-modal user360-modal"
        style={{ maxWidth: 920, width: '96%', maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <div className="detail-modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="detail-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Kpi({ label, val }: { label: string; val: React.ReactNode }) {
  return (
    <div className="u360-kpi">
      <h5>{val}</h5>
      <p>{label}</p>
    </div>
  );
}
function Tabs({ tabs, active, onSelect }: { tabs: [string, string][]; active: string; onSelect: (t: string) => void }) {
  return (
    <div
      className="user360-tabs"
      style={{ display: 'flex', gap: 2, background: 'white', overflowX: 'auto', whiteSpace: 'nowrap', padding: '0 8px', flexShrink: 0 }}
    >
      {tabs.map(([id, label]) => (
        <button key={id} className={'user360-tab' + (active === id ? ' active' : '')} onClick={() => onSelect(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}
const Empty = ({ msg }: { msg: string }) => <div className="u360-empty">{msg}</div>;
const Row = ({ l, v }: { l: string; v: React.ReactNode }) => (
  <div className="u360-row">
    <span className="lbl">{l}</span>
    <span className="val">{v}</span>
  </div>
);
const headerCardStyle: React.CSSProperties = {
  padding: 24,
  borderBottom: '1px solid #ECECEC',
  background: 'linear-gradient(135deg,#FAFAFC 0%, #F5F5F7 100%)',
  flexShrink: 0,
};
const kpiStripStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))',
  gap: 10,
  marginTop: 18,
};

/* ---------------- USER DETAIL ---------------- */
function UserDetail({ id }: { id: string }) {
  const { close, openOrder, openPost } = useDetail();
  const [user, setUser] = useState<Doc | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState('overview');
  const [kpis, setKpis] = useState<[string, React.ReactNode][]>([]);
  const [body, setBody] = useState<React.ReactNode>(<Empty msg="Loading…" />);

  useEffect(() => {
    (async () => {
      const d = await getDoc(doc(db, 'users', id)).catch(() => null);
      if (!d || !d.exists()) return setMissing(true);
      setUser(d.data());
    })();
  }, [id]);

  const isArtist = (user?.role || 'customer') === 'artist';

  useEffect(() => {
    if (!user) return;
    (async () => {
      const oq = isArtist ? where('artistId', '==', id) : where('customerId', '==', id);
      const os = await getDocs(query(collection(db, 'orders'), oq)).catch(() => ({ docs: [], size: 0 }) as never);
      let total = 0;
      os.docs.forEach((x: { data: () => Doc }) => (total += (x.data().total as number) || (x.data().totalAmount as number) || 0));
      let posts = 0, reels = 0;
      if (isArtist) {
        const ps = await getDocs(query(collection(db, 'posts'), where('artistId', '==', id))).catch(() => ({ docs: [] }) as never);
        ps.docs.forEach((x: { data: () => Doc }) => (x.data().mediaType === 'reel' ? reels++ : posts++));
      }
      const cards: [string, React.ReactNode][] = [
        ['Joined', fmtDate(user.createdAt)],
        ['Orders', os.size ?? os.docs.length],
        [isArtist ? 'Total Earned' : 'Total Spent', money(total)],
      ];
      if (isArtist) cards.push(['Posts', posts], ['Reels', reels]);
      cards.push(['Devices', Array.isArray(user.fcmTokens) ? user.fcmTokens.length : 0]);
      setKpis(cards);
    })();
  }, [user, isArtist, id]);

  useEffect(() => {
    if (!user) return;
    setBody(<Empty msg="Loading…" />);
    (async () => {
      setBody(await renderUserTab(tab, id, user, isArtist, openOrder, openPost));
    })();
  }, [tab, user, isArtist, id, openOrder, openPost]);

  if (missing) return <ModalShell title="User Profile" onClose={close}><Empty msg="User not found." /></ModalShell>;
  if (!user) return <ModalShell title="User Profile" onClose={close}><Empty msg="Loading…" /></ModalShell>;

  const status = (user.status as string) || 'active';
  const tabs: [string, string][] = [
    ['overview', 'Overview'],
    ['orders', 'Orders'],
    ...(isArtist ? ([['posts', 'Posts & Reels']] as [string, string][]) : []),
    ['ratings', 'Ratings'],
    ['reports', 'Reports'],
    ['notifications', 'Notifications'],
    ['wallet', 'Wallet'],
  ];

  async function setStatus(next: string) {
    await updateDoc(doc(db, 'users', id), { status: next });
    setUser({ ...user, status: next });
  }

  return (
    <ModalShell title="User Profile" onClose={close}>
      <div style={headerCardStyle}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <Avatar name={user.name as string} imgUrl={user.profileImageUrl as string} size={80} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <h4 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#262626' }}>{(user.name as string) || 'Unnamed'}</h4>
              <span
                className="status-badge"
                style={
                  status === 'active'
                    ? { background: 'rgba(27,153,139,0.10)', color: '#1B998B', border: '1.5px solid rgba(27,153,139,0.45)', textTransform: 'uppercase' }
                    : { background: 'rgba(165,58,51,0.10)', color: '#A53A33', border: '1.5px solid rgba(165,58,51,0.45)', textTransform: 'uppercase' }
                }
              >
                {status}
              </span>
            </div>
            <div style={{ color: '#8E8E8E', fontSize: 13, marginBottom: 6 }}>{(user.email as string) || 'no email'}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="status-badge" style={{ background: 'rgba(46,134,171,0.12)', color: '#2E86AB' }}>{isArtist ? 'Artist' : 'Customer'}</span>
              {user.category ? (
                <span className="status-badge" style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>{user.category as string}</span>
              ) : null}
              {typeof user.averageRating === 'number' ? (
                <span className="status-badge" style={{ background: 'rgba(227,169,60,0.10)', color: '#E3A93C', border: '1.5px solid rgba(227,169,60,0.45)' }}>
                  ★ {(user.averageRating as number).toFixed(1)}
                </span>
              ) : null}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn-action btn-view" onClick={() => pushPrompt(id, (user.name as string) || 'user')}>
              Push
            </button>
            {status === 'active' ? (
              <button
                className="btn-action btn-suspend"
                onClick={async () => {
                  if (await confirmDialog({ title: 'Suspend User', message: `Suspend ${user.name || 'this user'}?`, confirmText: 'Suspend' })) {
                    await setStatus('suspended');
                    toast('User suspended.', 'success');
                  }
                }}
              >
                Suspend
              </button>
            ) : (
              <button
                className="btn-action btn-activate"
                onClick={async () => {
                  await setStatus('active');
                  toast('User activated.', 'success');
                }}
              >
                Activate
              </button>
            )}
          </div>
        </div>
        <div style={kpiStripStyle}>
          {kpis.map(([l, v]) => (
            <Kpi key={l} label={l} val={v} />
          ))}
        </div>
      </div>
      <Tabs tabs={tabs} active={tab} onSelect={setTab} />
      <div style={{ padding: 20, minHeight: 260, overflowY: 'auto', flex: 1 }}>{body}</div>
    </ModalShell>
  );
}

async function renderUserTab(
  tab: string,
  id: string,
  user: Doc,
  isArtist: boolean,
  openOrder: (id: string) => void,
  openPost: (id: string) => void,
): Promise<React.ReactNode> {
  if (tab === 'overview') {
    const sub = await getDoc(doc(db, 'subscriptions', id)).catch(() => null);
    const s = sub && sub.exists() ? sub.data() : null;
    const rows: [string, React.ReactNode][] = [
      ['User ID', id],
      ['Phone', (user.phone as string) || '—'],
      ['Bio', (user.bio as string) || '—'],
      ['Category', (user.category as string) || '—'],
      ['Created', fmtDateTime(user.createdAt)],
      ['Last Updated', fmtDateTime(user.updatedAt)],
    ];
    if (isArtist) {
      rows.push(['Avg Rating', typeof user.averageRating === 'number' ? (user.averageRating as number).toFixed(2) + ' / 5' : '—']);
      rows.push(['Plan', s ? (s.plan as string) || 'free' : 'free']);
      rows.push(['Plan Status', s ? (s.status as string) || 'active' : '—']);
    }
    const card = user.payoutCard as { last4?: string; brand?: string; expMonth?: number; expYear?: number; holderName?: string } | undefined;
    const hasCard = !!(card && typeof card === 'object' && card.last4);
    return (
      <>
        <div className="u360-card">
          <h5 style={{ margin: '0 0 10px', fontSize: 14, color: '#262626' }}>Profile</h5>
          {rows.map(([l, v]) => (
            <Row key={l} l={l} v={v} />
          ))}
        </div>
        {isArtist && (
          <div className="u360-card" style={{ borderLeft: `4px solid ${hasCard ? '#10B981' : '#ED4956'}` }}>
            <h5 style={{ margin: '0 0 10px', fontSize: 14, color: '#262626' }}>{hasCard ? '💳 Payout Card Linked' : '⚠ No Payout Card'}</h5>
            {hasCard ? (
              <>
                <Row l="Brand" v={card!.brand === 'virtual_visa' ? 'Virtual Visa' : 'Virtual Card'} />
                <Row l="Number" v={`•••• •••• •••• ${card!.last4}`} />
                <Row l="Holder" v={card!.holderName || '—'} />
              </>
            ) : (
              <div style={{ fontSize: 13, color: '#8E8E8E', lineHeight: 1.5 }}>
                This artist <strong>cannot accept orders</strong> until they link a virtual payout card in the mobile app.
              </div>
            )}
          </div>
        )}
      </>
    );
  }
  if (tab === 'orders') {
    const oq = isArtist ? where('artistId', '==', id) : where('customerId', '==', id);
    const snap = await getDocs(query(collection(db, 'orders'), oq, limit(50))).catch(() => ({ docs: [] }) as never);
    if (!snap.docs.length) return <Empty msg="No orders yet." />;
    return (
      <div className="u360-card" style={{ padding: 0 }}>
        <table className="table custom-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>{isArtist ? 'Customer' : 'Artist'}</th>
              <th>Total</th>
              <th>Status</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {snap.docs.map((x: { id: string; data: () => Doc }) => {
              const o = x.data();
              return (
                <tr key={x.id}>
                  <td>{x.id.substring(0, 8)}…</td>
                  <td>{((isArtist ? o.customerName : o.artistName) as string) || 'N/A'}</td>
                  <td>{money((o.total as number) || (o.totalAmount as number))}</td>
                  <td>
                    <span className={'status-badge status-' + oClass(o.status as string)}>{oLabel(o.status as string)}</span>
                  </td>
                  <td>{fmtDate(o.createdAt)}</td>
                  <td>
                    <button className="btn-action btn-view-paid" onClick={() => openOrder(x.id)}>
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  if (tab === 'posts') {
    const snap = await getDocs(query(collection(db, 'posts'), where('artistId', '==', id))).catch(() => ({ docs: [] }) as never);
    if (!snap.docs.length) return <Empty msg="No posts or reels." />;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
        {snap.docs.map((x: { id: string; data: () => Doc }) => {
          const p = x.data();
          const isReel = p.mediaType === 'reel';
          const src = (isReel ? (p.thumbnailUrl as string) || (p.imageUrl as string) : (p.imageUrl as string)) || 'https://via.placeholder.com/140';
          return (
            <div
              key={x.id}
              style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: '#f0f0f0', cursor: 'pointer' }}
              onClick={() => openPost(x.id)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {isReel && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 26 }}>
                  ▶
                </div>
              )}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent,rgba(0,0,0,0.7))', color: 'white', fontSize: 10, padding: '6px 8px' }}>
                {isReel ? 'Reel · ' : ''}
                {(p.category as string) || ''}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  if (tab === 'ratings') {
    const field = isArtist ? 'artistId' : 'customerId';
    const snap = await getDocs(query(collection(db, 'ratings'), where(field, '==', id), limit(50))).catch(() => ({ docs: [] }) as never);
    if (!snap.docs.length) return <Empty msg={`No ratings ${isArtist ? 'received' : 'given'}.`} />;
    return (
      <>
        {snap.docs.map((x: { id: string; data: () => Doc }) => {
          const r = x.data();
          const stars = (r.stars as number) || 0;
          return (
            <div className="u360-card" key={x.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#E3A93C', fontSize: 16 }}>{'★'.repeat(stars) + '☆'.repeat(5 - stars)}</span>
                <span style={{ color: '#8E8E8E', fontSize: 11 }}>{fmtDate(r.createdAt)}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: '#262626' }}>{(r.comment as string) || (r.feedback as string) || '(no comment)'}</div>
              <div style={{ marginTop: 6, color: '#8E8E8E', fontSize: 11 }}>
                {isArtist ? 'From: ' + ((r.customerName as string) || 'Customer') : 'To: ' + ((r.artistName as string) || 'Artist')}
              </div>
            </div>
          );
        })}
      </>
    );
  }
  if (tab === 'notifications') {
    const snap = await getDocs(query(collection(db, 'notifications'), where('userId', '==', id), limit(40))).catch(() => ({ docs: [] }) as never);
    if (!snap.docs.length) return <Empty msg="No notifications." />;
    return (
      <>
        {snap.docs.map((x: { id: string; data: () => Doc }) => {
          const n = x.data();
          return (
            <div className="u360-card" key={x.id} style={{ opacity: n.isRead ? 0.7 : 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#262626' }}>{(n.title as string) || ''}</div>
              <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{(n.message as string) || ''}</div>
              <div style={{ fontSize: 10, color: '#8E8E8E', marginTop: 4, textTransform: 'uppercase' }}>
                {(n.type as string) || ''} · {fmtDateTime(n.createdAt)}
              </div>
            </div>
          );
        })}
      </>
    );
  }
  if (tab === 'reports') {
    const byMe = await getDocs(query(collection(db, 'reports'), where('reporterId', '==', id), limit(30))).catch(() => ({ docs: [] }) as never);
    if (!byMe.docs.length) return <Empty msg="No reports involving this user." />;
    return (
      <>
        {byMe.docs.map((x: { id: string; data: () => Doc }) => {
          const r = x.data();
          return (
            <div className="u360-card" key={x.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{(r.reason as string) || 'Report'}</strong>
                <span className={'status-badge status-' + (r.status === 'pending' ? 'pending' : 'reviewed')}>{(r.status as string) || 'pending'}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: '#8E8E8E' }}>Filed by user · {fmtDate(r.createdAt)}</div>
            </div>
          );
        })}
      </>
    );
  }
  if (tab === 'wallet') {
    const w = await getDoc(doc(db, 'wallets', id)).catch(() => null);
    const wallet = w && w.exists() ? w.data() : null;
    return (
      <div className="u360-card">
        <h5 style={{ fontSize: 13, color: '#8E8E8E', margin: '0 0 8px', textTransform: 'uppercase' }}>Wallet</h5>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#262626' }}>{money(wallet ? (wallet.balance as number) : 0)}</div>
        <div style={{ fontSize: 12, color: '#8E8E8E', marginTop: 4 }}>
          {wallet && wallet.updatedAt ? 'Last updated ' + fmtDateTime(wallet.updatedAt) : 'No wallet record yet'}
        </div>
      </div>
    );
  }
  return <Empty msg="Coming soon" />;
}

/* ---------------- POST DETAIL ---------------- */
function PostDetail({ id }: { id: string }) {
  const { close, openUser, openOrder } = useDetail();
  const [post, setPost] = useState<Doc | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState('overview');
  const [kpis, setKpis] = useState<[string, React.ReactNode][]>([]);
  const [body, setBody] = useState<React.ReactNode>(<Empty msg="Loading…" />);

  useEffect(() => {
    (async () => {
      const d = await getDoc(doc(db, 'posts', id)).catch(() => null);
      if (!d || !d.exists()) return setMissing(true);
      setPost(d.data());
    })();
  }, [id]);

  useEffect(() => {
    (async () => {
      const [os, rs] = await Promise.all([
        getDocs(collection(db, 'orders')).catch(() => ({ docs: [] }) as never),
        getDocs(query(collection(db, 'reports'), where('postId', '==', id))).catch(() => ({ docs: [] }) as never),
      ]);
      let count = 0, rev = 0;
      os.docs.forEach((x: { data: () => Doc }) => {
        const items = (x.data().items as { postId?: string; price?: number; quantity?: number }[]) || [];
        if (items.some((i) => i.postId === id)) {
          count++;
          items.forEach((i) => i.postId === id && (rev += (i.price || 0) * (i.quantity || 1)));
        }
      });
      setKpis([
        ['Times Ordered', count],
        ['Generated Revenue', money(rev)],
        ['Reports', rs.docs.length],
      ]);
    })();
  }, [id]);

  useEffect(() => {
    if (!post) return;
    setBody(<Empty msg="Loading…" />);
    (async () => setBody(await renderPostTab(tab, id, post, openOrder)))();
  }, [tab, post, id, openOrder]);

  if (missing) return <ModalShell title="Post Details" onClose={close}><Empty msg="Post not found." /></ModalShell>;
  if (!post) return <ModalShell title="Post Details" onClose={close}><Empty msg="Loading…" /></ModalShell>;

  const isReel = post.mediaType === 'reel';
  const status = (post.status as string) || 'active';
  const sc = status === 'active' ? '#1B998B' : status === 'reported' ? '#E3A93C' : '#A53A33';
  const src = (isReel ? (post.thumbnailUrl as string) || (post.imageUrl as string) : (post.imageUrl as string)) || 'https://via.placeholder.com/240';
  const desc = post.description as string;

  async function remove() {
    if (!(await confirmDialog({ title: 'Delete Post', message: 'Delete this post? This cannot be undone.', confirmText: 'Delete', type: 'danger' }))) return;
    await deleteDoc(doc(db, 'posts', id));
    toast('Post deleted.', 'success');
    close();
  }
  async function reactivate() {
    if (!post) return;
    await updateDoc(doc(db, 'posts', id), { status: 'active' });
    setPost({ ...post, status: 'active' });
  }

  return (
    <ModalShell title={(isReel ? 'Reel' : 'Post') + ' Details'} onClose={close}>
      <div style={headerCardStyle}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
          <div style={{ position: 'relative', width: 120, flexShrink: 0, borderRadius: 10, overflow: 'hidden', background: '#000', aspectRatio: '1' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {isReel && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 32 }}>
                ▶
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: '#262626' }}>
              {desc ? (desc.length > 90 ? desc.substring(0, 90) + '…' : desc) : '(no description)'}
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ color: '#8E8E8E', fontSize: 13, cursor: 'pointer' }} onClick={() => openUser(post.artistId as string)}>
                by <strong style={{ color: '#262626', textDecoration: 'underline' }}>{(post.artistName as string) || 'Unknown artist'}</strong>
              </span>
              <span style={{ background: sc + '1A', color: sc, border: `1px solid ${sc}73`, borderRadius: 10, padding: '1px 8px', fontSize: 10, fontWeight: 600, textTransform: 'capitalize' }}>
                {status}
              </span>
            </div>
            <span className="status-badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
              {(post.category as string) || 'Uncategorised'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {status !== 'removed' ? (
              <button className="btn-action btn-delete" onClick={remove}>
                Delete
              </button>
            ) : (
              <button className="btn-action btn-activate" onClick={reactivate}>
                Reactivate
              </button>
            )}
            <button className="btn-action btn-view" onClick={() => openUser(post.artistId as string)}>
              Artist 360°
            </button>
          </div>
        </div>
        <div style={kpiStripStyle}>
          {kpis.map(([l, v]) => (
            <Kpi key={l} label={l} val={v} />
          ))}
        </div>
      </div>
      <Tabs
        tabs={[
          ['overview', 'Overview'],
          ['media', 'Media'],
          ['orders', 'Orders'],
          ['reports', 'Reports'],
        ]}
        active={tab}
        onSelect={setTab}
      />
      <div style={{ padding: 20, minHeight: 240, overflowY: 'auto', flex: 1 }}>{body}</div>
    </ModalShell>
  );
}

async function renderPostTab(tab: string, id: string, post: Doc, openOrder: (id: string) => void): Promise<React.ReactNode> {
  if (tab === 'overview') {
    const rows: [string, React.ReactNode][] = [
      ['Description', (post.description as string) || '—'],
      ['Category', (post.category as string) || '—'],
      ['Price', money(post.price)],
      ['Status', (post.status as string) || 'active'],
      ['Media Type', (post.mediaType as string) || 'post'],
      ['Created', fmtDateTime(post.createdAt)],
    ];
    return (
      <div className="u360-card">
        <h5 style={{ margin: '0 0 10px', fontSize: 14, color: '#262626' }}>Details</h5>
        {rows.map(([l, v]) => (
          <Row key={l} l={l} v={v} />
        ))}
      </div>
    );
  }
  if (tab === 'media') {
    if (post.mediaType === 'reel') {
      return (
        <div style={{ background: '#000', borderRadius: 10, overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
          <video src={(post.videoUrl as string) || ''} poster={(post.thumbnailUrl as string) || ''} controls style={{ width: '100%', maxHeight: 520, objectFit: 'contain', background: '#000' }} />
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', justifyContent: 'center', background: '#F5F5F7', borderRadius: 10, padding: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={(post.imageUrl as string) || ''} alt="" style={{ maxWidth: '100%', maxHeight: 520, objectFit: 'contain', borderRadius: 8 }} />
      </div>
    );
  }
  if (tab === 'orders') {
    const os = await getDocs(collection(db, 'orders')).catch(() => ({ docs: [] }) as never);
    const rows = os.docs.filter((x: { data: () => Doc }) => ((x.data().items as { postId?: string }[]) || []).some((i) => i.postId === id));
    if (!rows.length) return <Empty msg="Never ordered." />;
    return (
      <div className="u360-card" style={{ padding: 0 }}>
        <table className="table custom-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x: { id: string; data: () => Doc }) => {
              const o = x.data();
              return (
                <tr key={x.id}>
                  <td>{x.id.substring(0, 8)}…</td>
                  <td>{(o.customerName as string) || 'N/A'}</td>
                  <td>{money((o.total as number) || (o.totalAmount as number))}</td>
                  <td>
                    <span className={'status-badge status-' + oClass(o.status as string)}>{oLabel(o.status as string)}</span>
                  </td>
                  <td>
                    <button className="btn-action btn-view-paid" onClick={() => openOrder(x.id)}>
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  if (tab === 'reports') {
    const rs = await getDocs(query(collection(db, 'reports'), where('postId', '==', id))).catch(() => ({ docs: [] }) as never);
    if (!rs.docs.length) return <Empty msg="No reports on this post." />;
    return (
      <>
        {rs.docs.map((x: { id: string; data: () => Doc }) => {
          const r = x.data();
          return (
            <div className="u360-card" key={x.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{(r.reason as string) || 'Report'}</strong>
                <span className={'status-badge status-' + (r.status === 'pending' ? 'pending' : 'reviewed')}>{(r.status as string) || 'pending'}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: '#8E8E8E' }}>By {(r.reporterName as string) || 'someone'} · {fmtDate(r.createdAt)}</div>
            </div>
          );
        })}
      </>
    );
  }
  return <Empty msg="Coming soon" />;
}

/* ---------------- REPORT DETAIL ---------------- */
function ReportDetail({ id }: { id: string }) {
  const { close, openUser, openPost } = useDetail();
  const [report, setReport] = useState<Doc | null>(null);
  const [missing, setMissing] = useState(false);
  const [post, setPost] = useState<Doc | null>(null);
  const [postLoading, setPostLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const d = await getDoc(doc(db, 'reports', id)).catch(() => null);
      if (!d || !d.exists()) return setMissing(true);
      setReport(d.data());
    })();
  }, [id]);

  useEffect(() => {
    const postId = report?.postId as string | undefined;
    if (!postId) return;
    setPostLoading(true);
    (async () => {
      try {
        const p = await getDoc(doc(db, 'posts', postId));
        setPost(p.exists() ? p.data() : null);
      } finally {
        setPostLoading(false);
      }
    })();
  }, [report?.postId]);

  if (missing) return <ModalShell title="Report Details" onClose={close}><Empty msg="Report not found." /></ModalShell>;
  if (!report) return <ModalShell title="Report Details" onClose={close}><Empty msg="Loading…" /></ModalShell>;

  const status = (report.status as string) || 'pending';
  const sc = status === 'pending' ? '#F59E0B' : status === 'reviewed' || status === 'resolved' ? '#10B981' : '#ED4956';
  const reason = (report.reason as string) || 'Report';

  async function resolve() {
    if (!report) return;
    await updateDoc(doc(db, 'reports', id), { status: 'resolved' });
    setReport({ ...report, status: 'resolved' });
    toast('Report resolved.', 'success');
  }
  async function removePost() {
    if (!report || !report.postId) return;
    if (!(await confirmDialog({ title: 'Remove Post', message: 'Remove the reported post?', confirmText: 'Remove', type: 'danger' }))) return;
    await updateDoc(doc(db, 'posts', report.postId as string), { status: 'removed' });
    await updateDoc(doc(db, 'reports', id), { status: 'reviewed' });
    toast('Post removed.', 'success');
    close();
  }

  return (
    <ModalShell title="Report Details" onClose={close}>
      <div style={{ overflowY: 'auto', padding: 0 }}>
        <div style={headerCardStyle}>
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: sc + '22', color: sc, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22, fontWeight: 700 }}>
              {(reason.trim().charAt(0) || 'R').toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#262626' }}>{reason}</h4>
              <div style={{ color: '#8E8E8E', fontSize: 13, marginBottom: 8 }}>
                Reported on {fmtDate(report.createdAt)} by{' '}
                <strong style={{ color: '#262626', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => openUser(report.reporterId as string)}>
                  {(report.reporterName as string) || 'unknown'}
                </strong>
              </div>
              <span className="status-badge" style={{ background: sc + '22', color: sc, textTransform: 'capitalize' }}>
                {status}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {status === 'pending' && (
                <button className="btn-action btn-activate" onClick={resolve}>
                  Mark resolved
                </button>
              )}
              <button className="btn-action btn-delete" onClick={removePost}>
                Remove post
              </button>
            </div>
          </div>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {report.postId ? (
            <div className="u360-card" style={{ padding: 14 }}>
              <h5 style={{ margin: '0 0 10px', fontSize: 14, color: '#262626' }}>Reported post</h5>
              {postLoading ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Loading post…</div>
              ) : post ? (
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      position: 'relative',
                      width: 140,
                      height: 140,
                      flexShrink: 0,
                      borderRadius: 10,
                      overflow: 'hidden',
                      background: '#000',
                      cursor: 'pointer',
                    }}
                    onClick={() => openPost(report.postId as string)}
                    title="Open post 360°"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        (post.mediaType === 'reel'
                          ? (post.thumbnailUrl as string) || (post.imageUrl as string)
                          : (post.imageUrl as string)) || 'https://via.placeholder.com/280'
                      }
                      alt="Reported post"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    {post.mediaType === 'reel' && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(0,0,0,0.25)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: 28,
                        }}
                      >
                        ▶
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: '#262626' }}>
                      by{' '}
                      <span
                        style={{ textDecoration: 'underline', cursor: 'pointer' }}
                        onClick={() => openUser(post.artistId as string)}
                      >
                        {(post.artistName as string) || 'Unknown artist'}
                      </span>
                    </p>
                    <p style={{ margin: '0 0 8px', fontSize: 13, color: '#5C6B73', lineHeight: 1.5 }}>
                      {(post.description as string) || '(no description)'}
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {post.category ? (
                        <span className="status-badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
                          {post.category as string}
                        </span>
                      ) : null}
                      <span
                        className="status-badge"
                        style={
                          (post.status as string) === 'removed'
                            ? { background: 'rgba(165,58,51,0.10)', color: '#A53A33' }
                            : { background: 'rgba(27,153,139,0.10)', color: '#1B998B' }
                        }
                      >
                        {(post.status as string) || 'active'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 16, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                  Post not found (may have been deleted).
                </div>
              )}
            </div>
          ) : null}

          <div className="u360-card">
            <h5 style={{ margin: '0 0 10px', fontSize: 14, color: '#262626' }}>Details</h5>
            <Row l="Reason" v={reason} />
            <Row l="Category" v={(report.category as string) || '—'} />
            <Row l="Status" v={status} />
            <Row l="Description" v={(report.description as string) || '—'} />
            <Row l="Created" v={fmtDateTime(report.createdAt)} />
          </div>

          {report.postId ? (
            <button className="btn-action btn-view" onClick={() => openPost(report.postId as string)}>
              View reported post
            </button>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}

/* ---------------- ORDER DETAIL ---------------- */
function OrderDetail({ id }: { id: string }) {
  const { close } = useDetail();
  const [order, setOrder] = useState<Doc | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    (async () => {
      const d = await getDoc(doc(db, 'orders', id)).catch(() => null);
      if (!d || !d.exists()) return setMissing(true);
      setOrder(d.data());
    })();
  }, [id]);

  if (missing) return <ModalShell title="Order Details" onClose={close}><Empty msg="Order not found." /></ModalShell>;
  if (!order) return <ModalShell title="Order Details" onClose={close}><Empty msg="Loading…" /></ModalShell>;

  const rows: [string, React.ReactNode][] = [
    ['Order ID', id],
    ['Customer', `${(order.customerName as string) || 'N/A'} (${(order.customerEmail as string) || ''})`],
    ['Artist', (order.artistName as string) || 'N/A'],
    ['Subtotal', money(order.subtotal)],
    ['Total', money(order.total)],
    ['Status', oLabel(order.status as string)],
    ['Payment Method', (order.paymentMethod as string) || 'N/A'],
    ['Payout Status', (order.payoutStatus as string) || 'N/A'],
    ['Date', fmtDateTime(order.createdAt)],
  ];
  if (order.estimatedCompletionDate) rows.push(['Estimated Completion', fmtDate(order.estimatedCompletionDate)]);
  if (Array.isArray(order.extensions) && order.extensions.length) rows.push(['Extensions Used', (order.extensions as unknown[]).length + ' / 3']);
  if (order.status === 'cancelled' || order.refundAmount) {
    rows.push(['Refund to Customer', money(order.refundAmount)]);
    rows.push(['Artist Compensation', money(order.cancellationArtistShare)]);
  }
  const items = (order.items as { title?: string; name?: string; price?: number; quantity?: number }[]) || [];

  return (
    <ModalShell title="Order Details" onClose={close}>
      <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
        <div className="u360-card">
          <h5 style={{ margin: '0 0 10px', fontSize: 14, color: '#262626' }}>Summary</h5>
          {rows.map(([l, v]) => (
            <Row key={l} l={l} v={v} />
          ))}
        </div>
        {items.length > 0 && (
          <div className="u360-card">
            <h5 style={{ margin: '0 0 10px', fontSize: 14, color: '#262626' }}>Items</h5>
            {items.map((it, i) => (
              <Row key={i} l={(it.title || it.name || 'Item') + (it.quantity ? ` ×${it.quantity}` : '')} v={money(it.price)} />
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
