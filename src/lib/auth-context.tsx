'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

type AdminProfile = {
  uid: string;
  email: string;
  name: string;
  role: string;
};

type AuthState = {
  user: User | null;
  profile: AdminProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Idle auto sign-out: 30 min of no mouse/keyboard activity → sign out.
  // Listeners are attached once; the timer is reset on activity. We only
  // arm them when there's a signed-in admin to avoid wasted work.
  useEffect(() => {
    if (!profile) return;
    const IDLE_MS = 30 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = async () => {
      await fbSignOut(auth);
    };
    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(trigger, IDLE_MS);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timer) clearTimeout(timer);
    };
  }, [profile]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // The original admin app uses a separate `admins/{uid}` collection
        // (with a `role` field). Read that first; fall back to
        // `users/{uid}.role === 'admin'` so accounts set up either way work.
        let adminData: Record<string, unknown> | undefined;
        try {
          const adminSnap = await getDoc(doc(db, 'admins', u.uid));
          if (adminSnap.exists()) adminData = adminSnap.data();
        } catch {
          // Rules may forbid the read for non-admins — fall through.
        }
        if (!adminData) {
          try {
            const userSnap = await getDoc(doc(db, 'users', u.uid));
            const data = userSnap.data();
            if (data && (data.role === 'admin' || data.role === 'super_admin')) {
              adminData = data;
            }
          } catch {
            // ignore
          }
        }

        if (adminData) {
          setProfile({
            uid: u.uid,
            email: u.email ?? '',
            name: (adminData.name as string) ?? (adminData.fullName as string) ?? '',
            role: (adminData.role as string) ?? 'admin',
          });
        } else {
          setProfile(null);
          await fbSignOut(auth);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function signIn(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signOut() {
    await fbSignOut(auth);
  }

  return (
    <Ctx.Provider value={{ user, profile, loading, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
