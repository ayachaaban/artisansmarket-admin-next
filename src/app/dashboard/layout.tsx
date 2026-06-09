'use client';

import 'bootstrap/dist/css/bootstrap.min.css';
import './legacy.css';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { DetailProvider } from '@/components/detail-modals';
import { UIHost } from '@/lib/ui';

/* Exact Bootstrap-Icons glyphs from artisansmarket-admin/html/dashboard.html */
const ICONS: Record<string, React.ReactNode> = {
  overview: (
    <>
      <path d="M8 4a.5.5 0 0 1 .5.5V6a.5.5 0 0 1-1 0V4.5A.5.5 0 0 1 8 4zM3.732 5.732a.5.5 0 0 1 .707 0l.915.914a.5.5 0 1 1-.708.708l-.914-.915a.5.5 0 0 1 0-.707zM2 10a.5.5 0 0 1 .5-.5h1.586a.5.5 0 0 1 0 1H2.5A.5.5 0 0 1 2 10zm9.5 0a.5.5 0 0 1 .5-.5h1.5a.5.5 0 0 1 0 1H12a.5.5 0 0 1-.5-.5zm.754-4.246a.389.389 0 0 0-.527-.02L7.547 9.31a.91.91 0 1 0 1.302 1.258l3.434-4.297a.389.389 0 0 0-.029-.518z" />
      <path fillRule="evenodd" d="M0 10a8 8 0 1 1 15.547 2.661c-.442 1.253-1.845 1.602-2.932 1.25C11.309 13.488 9.475 13 8 13c-1.474 0-3.31.488-4.615.911-1.087.352-2.49.003-2.932-1.25A7.988 7.988 0 0 1 0 10zm8-7a7 7 0 0 0-6.603 9.329c.203.575.923.876 1.68.63C4.397 12.533 6.358 12 8 12s3.604.532 4.923.96c.757.245 1.477-.056 1.68-.631A7 7 0 0 0 8 3z" />
    </>
  ),
  users: <path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7Zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5.784 6A2.238 2.238 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.325 6.325 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1h4.216ZM4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
  artists: <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z" />,
  posts: (
    <>
      <path d="M5.5 7a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-5zM5 9.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5z" />
      <path d="M9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.5L9.5 0zm0 1v2A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5z" />
    </>
  ),
  reports: (
    <>
      <path d="M7.938 2.016A.13.13 0 0 1 8.002 2a.13.13 0 0 1 .063.016.146.146 0 0 1 .054.057l6.857 11.667c.036.06.035.124.002.183a.163.163 0 0 1-.054.06.116.116 0 0 1-.066.017H1.146a.115.115 0 0 1-.066-.017.163.163 0 0 1-.054-.06.176.176 0 0 1 .002-.183L7.884 2.073a.147.147 0 0 1 .054-.057zm1.044-.45a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566z" />
      <path d="M7.002 12a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 5.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995z" />
    </>
  ),
  ratings: <path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z" />,
  analytics: <path d="M4 11H2v3h2v-3zm5-4H7v7h2V7zm5-5v12h-2V2h2zm-2-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1h-2zM6 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7zm-5 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-3z" />,
  subscriptions: (
    <>
      <path d="M5.5 9.511c.076.954.83 1.697 2.182 1.785V12h.6v-.709c1.4-.098 2.218-.846 2.218-1.932 0-.987-.626-1.496-1.745-1.76l-.473-.112V5.57c.6.068.982.396 1.074.85h1.052c-.076-.919-.864-1.638-2.126-1.716V4h-.6v.719c-1.195.117-2.01.836-2.01 1.853 0 .9.606 1.472 1.613 1.707l.397.098v2.034c-.615-.093-1.022-.43-1.114-.9H5.5zm2.177-2.166c-.59-.137-.91-.416-.91-.836 0-.47.345-.822.915-.925v1.76h-.005zm.692 1.193c.717.166 1.048.435 1.048.91 0 .542-.412.914-1.135.982V8.518l.087.02z" />
      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
    </>
  ),
  orders: <path d="M0 1.5A.5.5 0 0 1 .5 1H2a.5.5 0 0 1 .485.379L2.89 3H14.5a.5.5 0 0 1 .491.592l-1.5 8A.5.5 0 0 1 13 12H4a.5.5 0 0 1-.491-.408L2.01 3.607 1.61 2H.5a.5.5 0 0 1-.5-.5zM3.102 4l1.313 7h8.17l1.313-7H3.102zM5 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-7 1a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />,
  deadlines: (
    <>
      <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z" />
      <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z" />
    </>
  ),
  broadcast: (
    <>
      <path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-.708.707A7.476 7.476 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303l.708.707z" />
      <path d="M10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.483 5.483 0 0 1 11.025 8a5.483 5.483 0 0 1-1.61 3.89l.706.706z" />
      <path d="M8.707 11.182A4.486 4.486 0 0 0 10.025 8a4.486 4.486 0 0 0-1.318-3.182L8 5.525A3.489 3.489 0 0 1 9.025 8 3.49 3.49 0 0 1 8 10.475l.707.707zM6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06z" />
    </>
  ),
  paymentsPayouts: (
    <>
      <path d="M1 3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1H1zm0 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4H1zm3 3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z" />
      <path d="M0 3a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3zm2-1a1 1 0 0 0-1 1v1h14V3a1 1 0 0 0-1-1H2zm13 3H1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5z" />
    </>
  ),
  logout: (
    <>
      <path fillRule="evenodd" d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2z" />
      <path fillRule="evenodd" d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3z" />
    </>
  ),
  admins: (
    <path d="M5.072.56C6.157.265 7.31 0 8 0s1.843.265 2.928.56c1.11.3 2.229.655 2.887.87a1.54 1.54 0 0 1 1.044 1.262c.596 4.477-.787 7.795-2.465 9.99a11.8 11.8 0 0 1-2.517 2.453 7.1 7.1 0 0 1-1.048.625c-.28.132-.581.24-.829.24s-.548-.108-.829-.24a7.1 7.1 0 0 1-1.048-.625 11.8 11.8 0 0 1-2.517-2.453C1.262 10.485-.121 7.167.474 2.69A1.54 1.54 0 0 1 1.518 1.43c.658-.215 1.756-.562 2.842-.87Zm.318.95-.002.001a61 61 0 0 0-2.74.827.54.54 0 0 0-.364.42c-.552 4.146.715 7.118 2.25 9.124a10.8 10.8 0 0 0 2.315 2.262c.349.246.648.422.882.531.119.056.218.095.294.118A.5.5 0 0 0 8 15c.025-.005.059-.014.099-.027.076-.023.175-.062.294-.118.234-.11.533-.285.882-.531a10.8 10.8 0 0 0 2.315-2.262c1.536-2.006 2.802-4.978 2.25-9.124a.54.54 0 0 0-.364-.42 61 61 0 0 0-2.74-.827l-.002-.001C9.633 1.224 8.604.998 8 .998c-.604 0-1.633.226-2.61.512Z" />
  ),
};
const isSuper = (r?: string) => r === 'super-admin' || r === 'super_admin';

// Reports the admin has "deleted" from their bell — hidden from the bell only,
// persisted in this browser. The report itself stays for moderation.
function getDismissedBellReports(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const v = JSON.parse(localStorage.getItem('dismissedBellReports') || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const Icon = ({ name }: { name: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
    {ICONS[name]}
  </svg>
);

type NavItem = { page: string; href: string; label: string; badge?: 'reports' | 'deadlines'; superOnly?: boolean };

const NAV: NavItem[] = [
  { page: 'overview', href: '/dashboard/overview', label: 'Dashboard Overview' },
  { page: 'users', href: '/dashboard/users', label: 'Users' },
  { page: 'artists', href: '/dashboard/artists', label: 'Artists' },
  { page: 'posts', href: '/dashboard/posts', label: 'Posts' },
  { page: 'reports', href: '/dashboard/reports', label: 'Reports', badge: 'reports' },
  { page: 'ratings', href: '/dashboard/ratings', label: 'Ratings' },
  { page: 'analytics', href: '/dashboard/analytics', label: 'Analytics' },
  { page: 'subscriptions', href: '/dashboard/subscriptions', label: 'Subscriptions' },
  { page: 'orders', href: '/dashboard/orders', label: 'Orders' },
  { page: 'deadlines', href: '/dashboard/deadlines', label: 'Deadlines', badge: 'deadlines' },
  { page: 'broadcast', href: '/dashboard/notifications', label: 'Notifications' },
  { page: 'paymentsPayouts', href: '/dashboard/payments', label: 'Payments & Payouts' },
  { page: 'admins', href: '/dashboard/admins', label: 'Admin Management', superOnly: true },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [reports, setReports] = useState<{ id: string; reason?: string; createdAt?: unknown }[]>([]);
  const [popupOpen, setPopupOpen] = useState(false);
  const reportsCount = reports.length;

  useEffect(() => {
    if (!loading && !profile) router.replace('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'reports'), where('status', '==', 'pending')),
        );
        const dismissed = getDismissedBellReports();
        setReports(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as { reason?: string; createdAt?: unknown }) }))
            .filter((r) => !dismissed.includes(r.id)),
        );
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // Remove from the bell ONLY — hides it from this admin's bell (saved in the
  // browser); the report stays untouched on the Reports page for moderation.
  function deleteReport(id: string) {
    setReports((r) => r.filter((x) => x.id !== id));
    try {
      const next = Array.from(new Set([...getDismissedBellReports(), id]));
      localStorage.setItem('dismissedBellReports', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  // Clear every report from the bell at once (bell only — reports are kept).
  function dismissAllReports() {
    const ids = reports.map((r) => r.id);
    if (ids.length === 0) return;
    setReports([]);
    try {
      const next = Array.from(new Set([...getDismissedBellReports(), ...ids]));
      localStorage.setItem('dismissedBellReports', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  // Restore the saved dark-mode preference (shared with the login page).
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark') {
      document.body.classList.add('dark-mode');
    }
  }, []);

  if (loading || !profile) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  async function handleLogout() {
    await signOut();
    router.replace('/login');
  }

  return (
    <>
      {/* Sidebar */}
      <div className="sidebar" id="sidebar">
        <div className="sidebar-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/artisans-logo.png"
            alt="Artisans Market"
            style={{ width: '100%', height: 'auto', borderRadius: 8 }}
          />
        </div>
        <ul className="sidebar-menu">
          {NAV.filter((n) => !n.superOnly || isSuper(profile.role)).map(({ page, href, label, badge }) => {
            const active = pathname === href || pathname?.startsWith(href + '/');
            const count = badge === 'reports' ? reportsCount : 0;
            return (
              <li key={page} className={active ? 'active' : undefined} data-page={page}>
                <Link href={href} style={{ display: 'flex', alignItems: 'center', color: 'inherit', textDecoration: 'none', flex: 1 }}>
                  <Icon name={page} />
                  {label}
                  {badge && count > 0 && (
                    <span className="badge-notification" style={{ display: 'flex' }}>
                      {count}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
          <li id="logoutBtn" onClick={handleLogout}>
            <Icon name="logout" />
            Logout
          </li>
        </ul>
      </div>

      {/* Main content */}
      <div className="main-content">
        <div className="top-bar">
          <button className="menu-toggle" id="menuToggle">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z" />
            </svg>
          </button>
          <div className="top-bar-info">
            <div className="admin-info">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                <path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                <path fillRule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1z" />
              </svg>
              <span id="adminEmail">{profile.email}</span>
            </div>
            <div className="current-date" id="currentDate">{today}</div>
            <div
              className="notification-icon"
              id="notificationIcon"
              onClick={() => setPopupOpen((v) => !v)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zM8 1.918l-.797.161A4.002 4.002 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4.002 4.002 0 0 0-3.203-3.92L8 1.917zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 6.88 3 6c0-2.42 1.72-4.44 4.005-4.901a1 1 0 1 1 1.99 0A5.002 5.002 0 0 1 13 6c0 .88.32 4.2 1.22 6z" />
              </svg>
              {reportsCount > 0 && (
                <span className="notification-badge" style={{ display: 'flex' }}>
                  {reportsCount}
                </span>
              )}
              <div className="notification-popup" style={{ display: popupOpen ? 'block' : 'none' }}>
                <div className="notification-popup-header">
                  <span>Notifications</span>
                  <span className="notification-count">{reportsCount}</span>
                </div>
                <div className="notification-popup-body" style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {reports.length > 0 ? (
                    reports.map((r) => (
                      <div
                        key={r.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #F0F0F0' }}
                        onTouchStart={(e) => {
                          (e.currentTarget as HTMLDivElement).dataset.x = String(e.touches[0].clientX);
                        }}
                        onTouchEnd={(e) => {
                          const sx = Number((e.currentTarget as HTMLDivElement).dataset.x || 0);
                          if (e.changedTouches[0].clientX - sx < -50) deleteReport(r.id);
                        }}
                      >
                        <Link href="/dashboard/reports" style={{ flex: 1, minWidth: 0, color: '#2C3E50', textDecoration: 'none', fontSize: 13 }}>
                          <span style={{ fontWeight: 600 }}>Report</span>
                          <span style={{ color: '#8E8E8E' }}> — {r.reason || 'Reported content'}</span>
                        </Link>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            deleteReport(r.id);
                          }}
                          title="Delete report"
                          aria-label="Delete report"
                          style={{ background: 'transparent', border: 'none', color: '#A53A33', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z" />
                            <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1ZM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118ZM2.5 3V2h11v1h-11Z" />
                          </svg>
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="notification-empty">No new notifications</div>
                  )}
                </div>
                <div className="notification-popup-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {reports.length > 0 ? (
                    <button
                      onClick={dismissAllReports}
                      style={{ background: 'transparent', border: 'none', color: '#A53A33', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}
                    >
                      Clear all
                    </button>
                  ) : (
                    <span />
                  )}
                  <Link href="/dashboard/reports">View All Reports</Link>
                </div>
              </div>
            </div>
          </div>
          <div className="top-bar-actions">
            <button
              className="theme-toggle-dash"
              onClick={() => {
                const isDark = document.body.classList.toggle('dark-mode');
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z" />
              </svg>
            </button>
            <Link
              href="/dashboard/ai"
              className="ai-assistant-toggle"
              title="Ask AI assistant"
              aria-label="Ask AI assistant"
            >
              <span className="ai-assistant-toggle-inner">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zM11.5 9.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25z" />
                </svg>
              </span>
            </Link>
          </div>
        </div>

        <div className="dashboard-content">
          <DetailProvider>{children}</DetailProvider>
        </div>
        <UIHost />
      </div>
    </>
  );
}
