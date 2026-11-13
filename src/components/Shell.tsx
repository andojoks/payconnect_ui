import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { api, Notification, ProfileSummary, Session } from '../api';
import { cx, initials, relativeTime } from '../lib/format';
import { ConfirmDialog } from './ConfirmDialog';
import { ArrowLeftRight, Bell, Check, ChevronDown, Home, LogOut, Menu, Router, Search, Settings, Shield, TriangleAlert, UserCog, UserRound, Users, X } from 'lucide-react';

export type StreamEvent = {
  type: string;
  profileId?: string;
  at: string;
  data?: Record<string, unknown> | null;
};

export function useEventStream(path: string | null, onEvent: (event: StreamEvent) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    if (!path) return;
    const source = new EventSource(api.streamUrl(path), { withCredentials: true });
    const types = ['ready', 'notification', 'notification.read', 'transaction', 'transactions', 'balance', 'sync', 'fcm', 'callback', 'intent', 'profile'];
    const listeners = types.map((type) => {
      const listener = (message: MessageEvent) => {
        try {
          handler.current(JSON.parse(message.data) as StreamEvent);
        } catch {
          // Ignore malformed frames; the browser will reconnect automatically.
        }
      };
      source.addEventListener(type, listener as EventListener);
      return [type, listener] as const;
    });
    return () => {
      for (const [type, listener] of listeners) source.removeEventListener(type, listener as EventListener);
      source.close();
    };
  }, [path]);
}

type Toast = {
  id: string;
  title: string;
  body: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  href?: string;
};

type ToastContextValue = {
  pushToast: (toast: Omit<Toast, 'id'>) => void;
};

const ToastContext = createContext<ToastContextValue>({ pushToast: () => undefined });
export const useToast = () => useContext(ToastContext);

export type PageMeta = {
  title: string;
  eyebrow?: string;
};

type PageMetaContextValue = {
  setMeta: (meta: PageMeta | null) => void;
};

const PageMetaContext = createContext<PageMetaContextValue>({ setMeta: () => undefined });

export function usePageMeta(meta: PageMeta) {
  const { setMeta } = useContext(PageMetaContext);
  const { title, eyebrow } = meta;
  useEffect(() => {
    setMeta({ title, eyebrow });
    return () => setMeta(null);
  }, [title, eyebrow, setMeta]);
}

type PageActionsContextValue = {
  setActions: (actions: ReactNode | null) => void;
};

const PageActionsContext = createContext<PageActionsContextValue>({ setActions: () => undefined });

export function usePageActions(actions: ReactNode | null) {
  const { setActions } = useContext(PageActionsContext);
  useEffect(() => {
    setActions(actions);
    return () => setActions(null);
  }, [actions, setActions]);
}

type SearchContextValue = {
  query: string;
  setQuery: (value: string) => void;
};

const SearchContext = createContext<SearchContextValue>({ query: '', setQuery: () => undefined });
export const useGlobalSearch = () => useContext(SearchContext);

type Props = {
  session: Session;
  onLogout: () => void;
  children: ReactNode;
};

function notificationFromEvent(event: StreamEvent, profiles: ProfileSummary[]): Notification | null {
  const data = event.data ?? {};
  if (!event.profileId || typeof data.id !== 'string') return null;
  const profile = profiles.find((item) => item.id === event.profileId);
  return {
    id: data.id,
    profileId: event.profileId,
    phoneNumber: profile?.phoneNumber,
    title: String(data.title ?? 'MoMo alert'),
    body: String(data.body ?? ''),
    data: (data.data as Record<string, unknown> | undefined) ?? {},
    category: String((data.data as Record<string, unknown> | undefined)?.category ?? ''),
    receivedAt: String(data.receivedAt ?? event.at),
  };
}

function routeMeta(pathname: string): PageMeta {
  if (pathname.startsWith('/profiles/')) {
    const tail = pathname.split('/').filter(Boolean)[2] ?? 'overview';
    if (tail === 'transactions') return { title: 'Profile transactions' };
    if (tail === 'alerts') return { title: 'Profile alerts' };
    if (tail === 'account') return { title: 'Profile account' };
    if (tail === 'configuration' || tail === 'connection') return { title: 'Profile configuration' };
    return { title: 'Profile overview' };
  }
  if (pathname.startsWith('/router/')) return { title: 'Route details' };
  if (pathname.startsWith('/router')) return { title: 'Routing rules' };
  if (pathname.startsWith('/users/')) return { title: 'User details' };
  if (pathname.startsWith('/users')) return { title: 'Users' };
  if (pathname.startsWith('/roles/')) return { title: 'Role details' };
  if (pathname.startsWith('/roles')) return { title: 'Roles' };
  return { title: 'Profiles' };
}

function searchPlaceholder(pathname: string) {
  if (pathname.startsWith('/profiles/')) return 'Search transactions, alerts…';
  if (pathname.startsWith('/router')) return 'Search routes, callbacks…';
  if (pathname.startsWith('/admin')) return 'Search users, roles…';
  return 'Search profiles by phone or device…';
}

export function Shell({ session, onLogout, children }: Props) {
  const location = useLocation();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('payconnect.sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  const [pageMeta, setPageMeta] = useState<PageMeta | null>(null);
  const [pageActions, setPageActions] = useState<ReactNode | null>(null);
  const [query, setQuery] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [tip, setTip] = useState<{ label: string; x: number; y: number } | null>(null);

  function showTip(event: React.MouseEvent, label: string) {
    if (!collapsed) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({ label, x: rect.right + 10, y: rect.top + rect.height / 2 - 10 });
  }
  function hideTip() {
    setTip(null);
  }

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current.slice(-3), { ...toast, id }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 7000);
  }, []);

  useEffect(() => {
    void api.profiles().then(setProfiles).catch(() => undefined);
    void api.notifications(50).then(setNotifications).catch(() => undefined);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('payconnect.sidebar', collapsed ? 'collapsed' : 'expanded');
    } catch {
      // Storage can be unavailable in private browsing; the layout still works.
    }
  }, [collapsed]);

  useEffect(() => {
    setQuery('');
    setMobileOpen(false);
    setBellOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const unread = notifications.filter((item) => !item.readAt).length;

  useEventStream(session.authenticated ? '/api/v1/events/stream' : null, (event) => {
    if (event.type === 'notification') {
      const notification = notificationFromEvent(event, profiles);
      if (!notification) return;
      setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 100));
      const profile = profileMap.get(notification.profileId);
      pushToast({
        title: notification.title || 'New MoMo alert',
        body: `${profile?.phoneNumber ?? 'Profile'} · ${notification.body || 'Incoming notification'}`,
        tone: 'info',
        href: `/profiles/${notification.profileId}/alerts`,
      });
    }
    if (event.type === 'notification.read') {
      const data = event.data ?? {};
      if (data.all) {
        setNotifications((current) => current.map((item) => (item.profileId === event.profileId ? { ...item, readAt: new Date().toISOString() } : item)));
      } else if (typeof data.notificationId === 'string') {
        setNotifications((current) => current.map((item) => (item.id === data.notificationId ? { ...item, readAt: new Date().toISOString() } : item)));
      }
    }
    if (event.type === 'callback') {
      const data = event.data ?? {};
      const services = Array.isArray(data.services) ? (data.services as string[]) : [];
      if (services.length > 0) {
        pushToast({
          title: 'Callback routed',
          body: `A matching alert was delivered to ${services.length} service${services.length === 1 ? '' : 's'}.`,
          tone: 'success',
          href: '/router',
        });
      }
    }
    if (event.type === 'fcm' && (event.data?.status === 'reauthentication_required' || event.data?.status === 'error')) {
      pushToast({
        title: 'FCM needs attention',
        body: String(event.data?.error ?? 'The push listener could not authenticate.'),
        tone: 'danger',
        href: event.profileId ? `/profiles/${event.profileId}/configuration` : undefined,
      });
    }
    if (event.type === 'sync' && event.data?.status === 'error') {
      pushToast({
        title: 'Synchronization failed',
        body: String(event.data?.error ?? 'The provider did not respond.'),
        tone: 'warning',
        href: event.profileId ? `/profiles/${event.profileId}` : undefined,
      });
    }
  });

  const canManageServices = session.isRoot || session.permissions?.includes('services:manage');
  const canViewUsers = session.isRoot || session.permissions?.includes('users:view') || session.permissions?.includes('users:manage');
  const canManageRoles = session.isRoot || session.permissions?.includes('roles:manage') || session.permissions?.includes('roles:view');
  const roleLabel = session.isRoot ? 'Root operator' : session.isAdmin ? 'Administrator' : 'Operator';
  const meta = pageMeta ?? routeMeta(location.pathname);

  const profileScoped = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments[0] !== 'profiles' || segments.length < 2 || !segments[1]) return null;
    const id = segments[1];
    const rawPage = segments[2];
    const page = rawPage && ['transactions', 'alerts', 'account', 'configuration'].includes(rawPage) ? rawPage : 'overview';
    return { id, page };
  }, [location.pathname]);

  const searchValue = useMemo(() => ({ query, setQuery }), [query]);
  const metaValue = useMemo(() => ({ setMeta: setPageMeta }), []);
  const actionsValue = useMemo(() => ({ setActions: setPageActions }), []);

  async function signOut() {
    setSigningOut(true);
    try {
      await api.logout();
    } finally {
      onLogout();
    }
  }

  async function markRead(notification: Notification) {
    setNotifications((current) => current.map((item) => (item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item)));
    await api.markNotificationRead(notification.profileId, notification.id).catch(() => undefined);
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  return (
    <ToastContext.Provider value={{ pushToast }}>
      <SearchContext.Provider value={searchValue}>
        <PageMetaContext.Provider value={metaValue}>
          <PageActionsContext.Provider value={actionsValue}>
          <div className={cx('app-shell', collapsed && 'sidebar-collapsed')}>
            <aside className={cx('sidebar', mobileOpen && 'mobile-open')} aria-label="Primary navigation">
              <div className="sidebar-head">
                <Link to="/profiles" className="sidebar-brand" aria-label="PayConnect home" onClick={closeMobile}>
                  <span className="brand-mark">P</span>
                  <span className="brand-copy">
                    <strong>{meta.title}</strong>
                  </span>
                </Link>
                <button className="icon-button sidebar-close mobile-only" onClick={closeMobile} aria-label="Close navigation">
                  <X size={18} />
                </button>
              </div>

              <nav className="sidebar-nav">
                {profileScoped ? (
                  <>
                    <NavLink
                      to={`/profiles/${profileScoped.id}`}
                      end
                      className={({ isActive }) => cx('nav-item', isActive && 'active')}
                      onClick={closeMobile}
                      onMouseEnter={(e) => showTip(e, 'Overview')}
                      onMouseLeave={hideTip}
                    >
                      <Home size={18} />
                      <span className="nav-label">Overview</span>
                    </NavLink>
                    <NavLink
                      to={`/profiles/${profileScoped.id}/transactions`}
                      className={({ isActive }) => cx('nav-item', isActive && 'active')}
                      onClick={closeMobile}
                      onMouseEnter={(e) => showTip(e, 'Transactions')}
                      onMouseLeave={hideTip}
                    >
                      <ArrowLeftRight size={18} />
                      <span className="nav-label">Transactions</span>
                    </NavLink>
                    <NavLink
                      to={`/profiles/${profileScoped.id}/alerts`}
                      className={({ isActive }) => cx('nav-item', isActive && 'active')}
                      onClick={closeMobile}
                      onMouseEnter={(e) => showTip(e, 'Alerts')}
                      onMouseLeave={hideTip}
                    >
                      <TriangleAlert size={18} />
                      <span className="nav-label">Alerts</span>
                    </NavLink>
                    <NavLink
                      to={`/profiles/${profileScoped.id}/account`}
                      className={({ isActive }) => cx('nav-item', isActive && 'active')}
                      onClick={closeMobile}
                      onMouseEnter={(e) => showTip(e, 'Account')}
                      onMouseLeave={hideTip}
                    >
                      <UserRound size={18} />
                      <span className="nav-label">Account</span>
                    </NavLink>
                    <NavLink
                      to={`/profiles/${profileScoped.id}/configuration`}
                      className={({ isActive }) => cx('nav-item', isActive && 'active')}
                      onClick={closeMobile}
                      onMouseEnter={(e) => showTip(e, 'Configuration')}
                      onMouseLeave={hideTip}
                    >
                      <Settings size={18} />
                      <span className="nav-label">Configuration</span>
                    </NavLink>
                  </>
                ) : (
                  <>
                    <NavLink
                      to="/profiles"
                      end
                      className={({ isActive }) => cx('nav-item', isActive && 'active')}
                      onClick={closeMobile}
                      onMouseEnter={(e) => showTip(e, 'Profiles')}
                      onMouseLeave={hideTip}
                    >
                      <Users size={18} />
                      <span className="nav-label">Profiles</span>
                    </NavLink>
                    {canManageServices && (
                      <NavLink
                        to="/router"
                      className={({ isActive }) => cx('nav-item', isActive && 'active')}
                      onClick={closeMobile}
                      onMouseEnter={(e) => showTip(e, 'Routing rules')}
                      onMouseLeave={hideTip}
                    >
                      <Router size={18} />
                      <span className="nav-label">Routing rules</span>
                      </NavLink>
                    )}
                    {(canViewUsers || canManageRoles) && <span className="sidebar-label">Administration</span>}
                    {canViewUsers && (
                      <NavLink
                        to="/users"
                      className={({ isActive }) => cx('nav-item', isActive && 'active')}
                      onClick={closeMobile}
                      onMouseEnter={(e) => showTip(e, 'Users')}
                      onMouseLeave={hideTip}
                    >
                      <UserCog size={18} />
                      <span className="nav-label">Users</span>
                      </NavLink>
                    )}
                    {canManageRoles && (
                      <NavLink
                        to="/roles"
                      className={({ isActive }) => cx('nav-item', isActive && 'active')}
                      onClick={closeMobile}
                      onMouseEnter={(e) => showTip(e, 'Roles')}
                      onMouseLeave={hideTip}
                    >
                      <Shield size={18} />
                      <span className="nav-label">Roles</span>
                      </NavLink>
                    )}
                  </>
                )}
              </nav>

              <div className="sidebar-foot">
                <div className="nav-item-wrap sidebar-user">
                  <button type="button" className="sidebar-user-trigger" onClick={() => setUserMenuOpen((value) => !value)} title={session.user?.email}>
                    <span className="avatar">{initials(session.user?.email ?? 'PayConnect')}</span>
                    <span className="user-copy">
                      <strong>{session.user?.email}</strong>
                      <small>{roleLabel}</small>
                    </span>
                    <span className={cx('nav-caret', userMenuOpen && 'open')}><ChevronDown size={18} /></span>
                  </button>
                  {userMenuOpen && (
                    <div className={`nav-menu-panel ${collapsed ? 'right' : 'upward'}`}>
                      <button type="button" className="nav-menu-item" onClick={() => { setUserMenuOpen(false); setProfileDialogOpen(true); }}>
                        <Users size={18} />
                        <span className="nav-label">Profile</span>
                      </button>
                      <button type="button" className="nav-menu-item" onClick={() => { setUserMenuOpen(false); setConfirmSignOut(true); }}>
                        <LogOut size={18} />
                        <span className="nav-label">Sign out</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </aside>

            {tip && (
              <div className="sidebar-tooltip" style={{ left: tip.x, top: tip.y }}>
                {tip.label}
              </div>
            )}

            {mobileOpen && <div className="sidebar-scrim" onClick={closeMobile} role="presentation" />}

            <div className="app-main">
              <header className="appbar">
                <div className="appbar-left">
                  <button
                    className="icon-button appbar-toggle desktop-only"
                    onClick={() => setCollapsed((value) => !value)}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  >
                    <Menu size={18} />
                  </button>
                  <button className="icon-button appbar-toggle mobile-only" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
                    <Menu size={18} />
                  </button>
                  <div className="appbar-title">
                    <span className="eyebrow">{meta.eyebrow}</span>
                    <h1>{meta.title}</h1>
                  </div>
                </div>

                <div className="appbar-search">
                  <Search size={18} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={searchPlaceholder(location.pathname)}
                    aria-label="Search the current page"
                  />
                  {query && (
                    <button type="button" className="icon-button" onClick={() => setQuery('')} aria-label="Clear search">
                      <X size={18} />
                    </button>
                  )}
                </div>

                <div className="appbar-actions">
                  {pageActions}
                  <div className="bell-wrap">
                    <button
                      className={cx('icon-button bell', bellOpen && 'active')}
                      onClick={() => setBellOpen((value) => !value)}
                      aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
                    >
                      <Bell size={18} />
                      {unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
                    </button>
                    {bellOpen && (
                      <div className="bell-panel">
                        <div className="bell-head">
                          <div>
                            <span className="eyebrow">INBOX</span>
                            <strong>Notifications</strong>
                          </div>
                          <span className="badge">{unread} unread</span>
                        </div>
                        <div className="bell-list">
                          {notifications
                            .filter((item) => !item.readAt)
                            .slice(0, 5)
                            .map((notification) => {
                              const profile = profileMap.get(notification.profileId);
                              return (
                                <Link
                                  key={notification.id}
                                  className={cx('bell-item', !notification.readAt && 'unread')}
                                  to={`/profiles/${notification.profileId}/alerts`}
                                  onClick={() => {
                                    void markRead(notification);
                                    setBellOpen(false);
                                  }}
                                >
                                  <span className="bell-icon">
                                    <TriangleAlert size={18} />
                                  </span>
                                  <span className="bell-body">
                                    <strong>{notification.title}</strong>
                                    <small>{notification.body || 'Incoming provider alert'}</small>
                                    <em>
                                      {profile?.phoneNumber ?? 'Profile'} · {relativeTime(notification.receivedAt)}
                                    </em>
                                  </span>
                                </Link>
                              );
                            })}
                          {unread > 5 && (
                            <div className="bell-item">
                              <span></span>
                              <span className="bell-body">
                                <strong>+{unread - 5} more</strong>
                              </span>
                            </div>
                          )}
                          {unread === 0 && <p className="muted bell-empty">No alerts yet. Notifications from every connected profile land here.</p>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </header>

              <main className="app-content">{children}</main>
            </div>

            <div className="toast-stack" aria-live="polite">
              {toasts.map((toast) => {
                const content = (
                  <>
                    <span className={cx('toast-mark', toast.tone)}>
                      {toast.tone === 'danger' ? <TriangleAlert size={18} /> : toast.tone === 'success' ? <Check size={18} /> : <Bell size={18} />}
                    </span>
                    <span className="toast-copy">
                      <strong>{toast.title}</strong>
                      <small>{toast.body}</small>
                    </span>
                  </>
                );
                return toast.href ? (
                  <Link key={toast.id} to={toast.href} className={cx('toast', toast.tone)} onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>
                    {content}
                  </Link>
                ) : (
                  <div key={toast.id} className={cx('toast', toast.tone)}>
                    {content}
                  </div>
                );
              })}
            </div>
            {profileDialogOpen ? (
              <div className="modal-backdrop" role="presentation">
                <section className="modal" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title">
                  <div className="modal-header">
                    <div>
                      <span className="eyebrow">ACCOUNT</span>
                      <h2 id="profile-dialog-title">Profile information</h2>
                    </div>
                    <button className="icon-button" onClick={() => setProfileDialogOpen(false)} aria-label="Close">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="details">
                    <div><dt>User ID</dt><dd className="mono">{session.user?.id ?? '—'}</dd></div>
                    <div><dt>Email</dt><dd>{session.user?.email ?? '—'}</dd></div>
                    <div><dt>Access</dt><dd>{session.isRoot ? 'Root operator' : session.isAdmin ? 'Administrator' : 'Operator'}</dd></div>
                    <div><dt>Roles</dt><dd>{(session.roles ?? []).join(', ') || '—'}</dd></div>
                    <div><dt>Permissions</dt><dd>{(session.permissions ?? []).join(', ') || '—'}</dd></div>
                  </div>
                  <div className="modal-actions">
                    <button className="ghost" onClick={() => setProfileDialogOpen(false)}>Close</button>
                  </div>
                </section>
              </div>
            ) : null}
            {confirmSignOut && (
              <ConfirmDialog
                title="Sign out"
                description="Sign out of PayConnect on this device?"
                confirmLabel="Sign out"
                tone="danger"
                busy={signingOut}
                onCancel={() => setConfirmSignOut(false)}
                onConfirm={() => { setConfirmSignOut(false); void signOut(); }}
              />
            )}
          </div>
          </PageActionsContext.Provider>
        </PageMetaContext.Provider>
      </SearchContext.Provider>
    </ToastContext.Provider>
  );
}
