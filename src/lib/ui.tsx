'use client';

import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, getDoc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

/* Ported from artisansmarket-admin: showToast / showConfirm / sendPushPrompt.
   Imperative API so any component can call toast()/confirmDialog()/pushPrompt(). */

type ToastType = 'success' | 'error' | 'warning' | 'info';
type ToastItem = { id: number; message: string; type: ToastType; duration: number; exiting?: boolean };
type ConfirmOpts = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'warning' | 'danger' | 'info';
  /* one of: confirm-modal-suspend | confirm-modal-delete | confirm-modal-approve | confirm-modal-reject */
  modalClass?: string;
};
const TYPE_TO_MODAL_CLASS: Record<string, string> = {
  danger: 'confirm-modal-delete',
  warning: 'confirm-modal-suspend',
  info: 'confirm-modal-approve',
};
type ConfirmState = ConfirmOpts & { resolve: (v: boolean) => void };
type PushState = { userId: string; name: string };

/* Route through a window event bus so the imperative API keeps working across
   Next.js fast-refresh / HMR (a module-level singleton can go stale mid-session). */
function emit(name: string, detail: unknown) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function toast(message: string, type: ToastType = 'info', duration = 4000) {
  emit('ui:toast', { message, type, duration });
}
export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => emit('ui:confirm', { ...opts, resolve }));
}
export function pushPrompt(userId: string, name: string) {
  emit('ui:push', { userId, name });
}
export type OrderForActions = Record<string, unknown> & { id: string; status?: string };
export function orderActions(order: OrderForActions, onDone?: () => void) {
  emit('ui:orderActions', { order, onDone });
}

const PUSH_WORKER_URL = 'https://artisans-push.artisansmarket.workers.dev';
const PUSH_AUTH_TOKEN = 'f59d5b3cb8b2c54a2fea349b000ffeede367b8d3f6f7997a21f453f10fe180cf';

async function sendPushToUser(userId: string, title: string, body: string) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    const tokens = ((userDoc.data()?.fcmTokens as string[]) || []).filter((t) => typeof t === 'string' && t.length > 0);
    if (tokens.length === 0) return { sent: 0, failed: 0 };
    const res = await fetch(PUSH_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Push-Auth': PUSH_AUTH_TOKEN },
      body: JSON.stringify({ tokens, title, body }),
    });
    if (!res.ok) return { sent: 0, failed: tokens.length };
    return (await res.json()) as { sent?: number; failed?: number };
  } catch {
    return { sent: 0, failed: 0 };
  }
}

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
  success: <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z" />,
  error: <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646z" />,
  warning: <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />,
  info: <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.399l-.334-.027.09-.418H8.93zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />,
};
const CONFIRM_ICONS: Record<string, { fill: string }> = {
  warning: { fill: '#C4A265' },
  danger: { fill: '#dc3545' },
  info: { fill: '#2E86AB' },
};

export function UIHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [push, setPush] = useState<PushState | null>(null);
  const [orderAct, setOrderAct] = useState<{ order: OrderForActions; onDone?: () => void } | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    const addToast = (t: Omit<ToastItem, 'id'>) => {
      const id = ++counter.current;
      setToasts((cur) => [...cur, { ...t, id }]);
      setTimeout(() => {
        setToasts((cur) => cur.map((x) => (x.id === id ? { ...x, exiting: true } : x)));
        setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 400);
      }, t.duration);
    };
    const onToast = (e: Event) => addToast((e as CustomEvent).detail);
    const onConfirm = (e: Event) => setConfirmState((e as CustomEvent).detail);
    const onPush = (e: Event) => setPush((e as CustomEvent).detail);
    const onOrderAct = (e: Event) => setOrderAct((e as CustomEvent).detail);
    window.addEventListener('ui:toast', onToast);
    window.addEventListener('ui:confirm', onConfirm);
    window.addEventListener('ui:push', onPush);
    window.addEventListener('ui:orderActions', onOrderAct);
    return () => {
      window.removeEventListener('ui:toast', onToast);
      window.removeEventListener('ui:confirm', onConfirm);
      window.removeEventListener('ui:push', onPush);
      window.removeEventListener('ui:orderActions', onOrderAct);
    };
  }, []);

  function dismiss(id: number) {
    setToasts((cur) => cur.map((x) => (x.id === id ? { ...x, exiting: true } : x)));
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 400);
  }

  return (
    <>
      {/* Toasts */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={'toast-notification toast-' + t.type + (t.exiting ? ' toast-exit' : '')}>
            <div className="toast-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                {TOAST_ICONS[t.type]}
              </svg>
            </div>
            <div className="toast-message">{t.message}</div>
            <button className="toast-close" onClick={() => dismiss(t.id)}>
              ×
            </button>
            <div className="toast-progress">
              <div className="toast-progress-bar" style={{ animationDuration: t.duration + 'ms' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Confirm modal */}
      {confirmState && (
        <div
          className="confirm-modal-overlay active"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              confirmState.resolve(false);
              setConfirmState(null);
            }
          }}
        >
          <div className={'confirm-modal ' + (confirmState.modalClass || TYPE_TO_MODAL_CLASS[confirmState.type || 'warning'])}>
            <div className="confirm-modal-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill={CONFIRM_ICONS[confirmState.type || 'warning'].fill} viewBox="0 0 16 16">
                {TOAST_ICONS[confirmState.type === 'danger' ? 'error' : confirmState.type === 'info' ? 'info' : 'warning']}
              </svg>
            </div>
            <h3 className="confirm-modal-title">{confirmState.title}</h3>
            <p className="confirm-modal-message">{confirmState.message}</p>
            <div className="confirm-modal-actions">
              <button
                className="confirm-modal-btn confirm-modal-cancel"
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
              >
                {confirmState.cancelText || 'Cancel'}
              </button>
              <button
                className="confirm-modal-btn confirm-modal-confirm"
                onClick={() => {
                  confirmState.resolve(true);
                  setConfirmState(null);
                }}
              >
                {confirmState.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Push prompt */}
      {push && <PushModal push={push} onClose={() => setPush(null)} />}

      {/* Order admin actions */}
      {orderAct && (
        <OrderActionsModal order={orderAct.order} onDone={orderAct.onDone} onClose={() => setOrderAct(null)} />
      )}
    </>
  );
}

const ORDER_STATUSES = ['pending', 'in_progress', 'shipping', 'delivered', 'cancelled'];
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  shipping: 'Shipping',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  paid: 'Paid',
  processing: 'Processing',
  shipped: 'Shipped',
};

function OrderActionsModal({
  order,
  onDone,
  onClose,
}: {
  order: OrderForActions;
  onDone?: () => void;
  onClose: () => void;
}) {
  const cur = (order.estimatedCompletionDate as { toDate?: () => Date } | undefined)?.toDate?.();
  const [status, setStatus] = useState((order.status as string) || 'pending');
  const [deadline, setDeadline] = useState(cur ? cur.toISOString().split('T')[0] : '');
  const [reason, setReason] = useState('');
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [notifyArtist, setNotifyArtist] = useState(true);
  const [saving, setSaving] = useState(false);

  async function apply() {
    setSaving(true);
    try {
      const updates: Record<string, unknown> = { status, updatedAt: serverTimestamp() };
      if (deadline) {
        updates.estimatedCompletionDate = Timestamp.fromDate(new Date(deadline + 'T12:00:00'));
        if (!order.acceptedAt) updates.acceptedAt = serverTimestamp();
      }
      await updateDoc(doc(db, 'orders', order.id), updates);

      const shortId = order.id.substring(0, 8).toUpperCase();
      const label = STATUS_LABELS[status] || status;
      const notify = async (uid: unknown, title: string, body: string) => {
        if (!uid) return;
        await addDoc(collection(db, 'notifications'), {
          userId: uid,
          title,
          message: body,
          type: 'order_status',
          referenceId: order.id,
          isRead: false,
          createdAt: serverTimestamp(),
        });
        await sendPushToUser(uid as string, title, body);
      };
      if (notifyCustomer)
        await notify(order.customerId, 'Order update', `Your order #${shortId} is now: ${label}${reason ? ' (' + reason + ')' : ''}`);
      if (notifyArtist)
        await notify(order.artistId, 'Order update', `Order #${shortId} is now: ${label}${reason ? ' (' + reason + ')' : ''}`);

      toast('Order updated.', 'success');
      onDone?.();
      onClose();
    } catch {
      toast('Failed to update order.', 'error');
      setSaving(false);
    }
  }

  const tealBtn: React.CSSProperties = {
    padding: '8px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    background: 'transparent',
    color: '#1B998B',
    border: '1.5px solid rgba(27,153,139,0.45)',
  };

  return (
    <div className="detail-modal-overlay active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="detail-modal" style={{ maxWidth: 520 }}>
        <div className="detail-modal-header">
          <h3>Admin Actions — Order {order.id.substring(0, 8)}</h3>
          <button className="detail-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="detail-modal-body">
          <div className="mb-3">
            <label className="form-label">Override Status</label>
            <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <small className="text-muted">Current: {STATUS_LABELS[(order.status as string) || 'pending'] || order.status}</small>
          </div>
          <div className="mb-3">
            <label className="form-label">Set / Override Deadline (optional)</label>
            <input type="date" className="form-control" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            <small className="text-muted">Leave blank to keep current.</small>
          </div>
          <div className="mb-3">
            <label className="form-label">Reason (audit log)</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. customer disputed shipment"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="form-check mb-2">
            <input className="form-check-input" type="checkbox" id="adminNotifyCustomer" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} />
            <label className="form-check-label" htmlFor="adminNotifyCustomer">
              Notify customer (in-app + push)
            </label>
          </div>
          <div className="form-check mb-3">
            <input className="form-check-input" type="checkbox" id="adminNotifyArtist" checked={notifyArtist} onChange={(e) => setNotifyArtist(e.target.checked)} />
            <label className="form-check-label" htmlFor="adminNotifyArtist">
              Notify artist (in-app + push)
            </label>
          </div>
          <div className="d-flex gap-2 justify-content-end">
            <button style={tealBtn} onClick={onClose}>
              Cancel
            </button>
            <button style={tealBtn} onClick={apply} disabled={saving}>
              {saving ? 'Saving...' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PushModal({ push, onClose }: { push: PushState; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!title.trim() || !body.trim()) {
      toast('Title and message are required.', 'warning');
      return;
    }
    setSending(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: push.userId,
        title: title.trim(),
        message: body.trim(),
        type: 'order_status',
        referenceId: '',
        isRead: false,
        createdAt: serverTimestamp(),
      });
      const r = await sendPushToUser(push.userId, title.trim(), body.trim());
      toast('Sent — ' + (r.sent || 0) + ' device(s) reached.', 'success');
      onClose();
    } catch {
      toast('Failed to send.', 'error');
      setSending(false);
    }
  }

  const pushBtn: React.CSSProperties = {
    padding: '8px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    background: 'transparent',
    color: '#B85C38',
    border: '1.5px solid rgba(184,92,56,0.45)',
  };

  return (
    <div className="detail-modal-overlay active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="detail-modal" style={{ maxWidth: 480 }}>
        <div className="detail-modal-header">
          <h3>Send notification to {push.name || 'user'}</h3>
          <button className="detail-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="detail-modal-body">
          <div className="mb-3">
            <label className="form-label">Title</label>
            <input
              type="text"
              className="form-control"
              maxLength={80}
              placeholder="e.g. Welcome to Artisans Market"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Message</label>
            <textarea
              className="form-control"
              rows={3}
              maxLength={250}
              placeholder="Body of the notification"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="d-flex gap-2 justify-content-end">
            <button style={pushBtn} onClick={onClose}>
              Cancel
            </button>
            <button style={pushBtn} onClick={send} disabled={sending}>
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
