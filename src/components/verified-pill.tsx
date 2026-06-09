'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/* Process-wide cache so the same userId across many rows costs exactly
   one Firestore read per session. */
const cache = new Map<string, boolean>();
const inflight = new Map<string, Promise<boolean>>();

function isVerified(userId: string): Promise<boolean> {
  if (!userId) return Promise.resolve(false);
  const hit = cache.get(userId);
  if (hit !== undefined) return Promise.resolve(hit);
  const pending = inflight.get(userId);
  if (pending) return pending;

  const fut = getDoc(doc(db, 'users', userId))
    .then((d) => {
      const v = (d.data()?.emailVerified as boolean) === true;
      cache.set(userId, v);
      inflight.delete(userId);
      return v;
    })
    .catch(() => {
      inflight.delete(userId);
      return false;
    });
  inflight.set(userId, fut);
  return fut;
}

/**
 * Premium verified-state badge — Stripe/Linear-style outlined pill.
 *
 * Pre-known state:  <VerifiedPill verified={true} />
 * Look up by uid:   <VerifiedPill userId={uid} />
 */
export function VerifiedPill({
  userId,
  verified: known,
  showLabel = true,
}: {
  userId?: string;
  verified?: boolean;
  /** Show the "Verified" / "Unverified" word; default true. */
  showLabel?: boolean;
}) {
  const [verified, setVerified] = useState<boolean | null>(
    typeof known === 'boolean' ? known : null,
  );

  useEffect(() => {
    if (typeof known === 'boolean') {
      setVerified(known);
      return;
    }
    if (!userId) {
      setVerified(false);
      return;
    }
    let alive = true;
    isVerified(userId).then((v) => {
      if (alive) setVerified(v);
    });
    return () => {
      alive = false;
    };
  }, [userId, known]);

  if (verified === null) return null;
  return verified ? <VerifiedBadge labeled={showLabel} /> : <UnverifiedBadge labeled={showLabel} />;
}

/* ───────── Verified ───────── */

function VerifiedBadge({ labeled }: { labeled: boolean }) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: 'rgba(16,185,129,0.10)',
    color: '#047857',
    border: '1px solid rgba(16,185,129,0.40)',
    borderRadius: 999,
    fontWeight: 600,
    letterSpacing: 0.1,
    lineHeight: 1,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  };
  if (!labeled) {
    return (
      <span
        title="Email verified"
        style={{ ...base, padding: 3, width: 22, height: 22, justifyContent: 'center' }}
      >
        <CheckIcon />
      </span>
    );
  }
  return (
    <span
      title="Email verified"
      style={{ ...base, padding: '3px 9px 3px 7px', fontSize: 11 }}
    >
      <CheckIcon />
      Verified
    </span>
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/* ───────── Unverified ───────── */

function UnverifiedBadge({ labeled }: { labeled: boolean }) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: 'rgba(245,158,11,0.10)',
    color: '#B45309',
    border: '1px solid rgba(245,158,11,0.40)',
    borderRadius: 999,
    fontWeight: 600,
    letterSpacing: 0.1,
    lineHeight: 1,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  };
  if (!labeled) {
    return (
      <span
        title="Email not verified"
        style={{ ...base, padding: 3, width: 22, height: 22, justifyContent: 'center' }}
      >
        <AlertIcon />
      </span>
    );
  }
  return (
    <span
      title="Email not verified"
      style={{ ...base, padding: '3px 9px 3px 7px', fontSize: 11 }}
    >
      <AlertIcon />
      Unverified
    </span>
  );
}

function AlertIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
