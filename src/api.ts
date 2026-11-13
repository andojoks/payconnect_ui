export type Balance = { amount: number; currency: string };

export type ProfileSummary = {
  id: string;
  phoneNumber: string;
  provider: string;
  balance?: Balance;
  balanceObservedAt?: string;
  fcmStatus: 'disabled' | 'active' | 'reauthentication_required' | 'error';
  fcmEnabled: boolean;
  authStatus: 'draft' | 'active';
  createdAt: string;
  updatedAt: string;
  disconnectedAt?: string;
  syncStatus: 'idle' | 'running' | 'error' | string;
  lastSyncedAt?: string;
  transactionCount: number;
  notificationCount: number;
  unreadNotifications: number;
  fcmLastEventAt?: string;
  deviceModel: string;
};

export type ProfileDetail = ProfileSummary & {
  fcmLastSyncAt?: string;
  fcmLastError?: string;
  syncError?: string;
  syncStartedAt?: string;
  deviceId: string;
  deviceType: string;
  deviceBrand: string;
  deviceName: string;
  deviceLocation: string;
  deviceIP: string;
  deviceFreeDisk: number;
  hasSession: boolean;
};

export type Transaction = {
  id: string;
  providerTransactionId?: string;
  amount: number;
  currency: string;
  direction: string;
  status: string;
  reference?: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
  created?: boolean;
  source?: string;
};

export type TransactionPage = {
  transactions: Transaction[];
  total: number;
  limit: number;
  offset: number;
};

export type Notification = {
  id: string;
  profileId: string;
  phoneNumber?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  category?: string;
  receivedAt: string;
  readAt?: string;
  routedTo?: string;
  providerMessageId?: string;
};

export type Session = {
  authenticated: boolean;
  user?: { id: string; email: string };
  isAdmin?: boolean;
  isRoot?: boolean;
  roles?: string[];
  permissions?: string[];
};

export type ServiceProfile = { id: string; phoneNumber: string; provider: string };

export type Service = {
  id: string;
  name: string;
  description: string;
  callbackUrl: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastDeliveryAt?: string;
  profiles: ServiceProfile[];
  pendingIntents: number;
  pendingDeliveries: number;
  failedDeliveries: number;
  secret?: string;
};

export type Intent = {
  id: string;
  serviceId: string;
  profileId: string;
  phoneNumber: string;
  amount?: number;
  currency: string;
  reference: string;
  status: 'pending' | 'matched' | 'cancelled' | string;
  eventType: string;
  createdAt: string;
  expiresAt?: string;
  matchedAt?: string;
  matchedNotificationId?: string;
};

export type Delivery = {
  id: string;
  eventId: string;
  eventType: string;
  idempotencyKey: string;
  status: 'pending' | 'retrying' | 'delivered' | 'failed' | string;
  attempts: number;
  lastError?: string;
  lastStatusCode?: number;
  lastResponse?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  deliveredAt?: string;
};

export type FCMStatus = {
  profileId: string;
  enabled: boolean;
  status: string;
  running: boolean;
  updatedAt: string;
  lastEventAt?: string;
  lastSyncAt?: string;
  lastError?: string;
};

export type AdminUser = {
  id: string;
  email: string;
  isAdmin: boolean;
  isRoot: boolean;
  disabled: boolean;
  createdAt: string;
  roles: string[];
};

export type AdminUserDetail = {
  id: string;
  email: string;
  isAdmin: boolean;
  isRoot: boolean;
  disabled: boolean;
  createdAt: string;
  roles: { id: string; name: string }[];
  permissions: string[];
  profileAccess: { profileId: string; phoneNumber: string; provider: string }[];
};

export type Role = { id: string; name: string; description: string; permissions: string[] };
export type RoleDetail = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  users: { id: string; email: string; isRoot: boolean; isAdmin: boolean }[];
};
export type ProfileAccess = { userId: string; profileId: string };

const configuredApiBase = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

// Single API origin for every request and for the integration guide. Production
// builds supply VITE_API_URL; if it is missing, fall back to same-origin rather
// than baking localhost into the deployed bundle. Only the dev server defaults
// to the local API.
export const API_BASE_URL = configuredApiBase
  || (import.meta.env.DEV ? 'http://localhost:8080' : '');

const API = API_BASE_URL;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      message = parsed.error ?? parsed.message ?? text;
    } catch {
      // http.Error writes plain text.
    }
    throw new ApiError(message || `Request failed (${response.status})`, response.status);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

function queryString(values: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export const api = {
  baseUrl: API,
  streamUrl: (path: string) => `${API}${path}`,

  login: (email: string, password: string) =>
    request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) =>
    request<{ id: string; email: string }>('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  session: () => request<Session>('/api/v1/auth/session'),
  logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }),

  profiles: () => request<ProfileSummary[]>('/api/v1/profiles'),
  profile: (id: string) => request<ProfileDetail>(`/api/v1/profiles/${id}`),
  createProfile: (phoneNumber: string, pin: string) =>
    request<ProfileSummary>('/api/v1/profiles', { method: 'POST', body: JSON.stringify({ phoneNumber, pin }) }),
  disconnectProfile: (id: string) => request<void>(`/api/v1/profiles/${id}`, { method: 'DELETE' }),
  startProfileAuth: (phoneNumber: string, reauth = false) =>
    request<{ challengeId: string; resumeStep?: 'identity' | 'pin' | 'otp'; profileId?: string }>('/api/v1/profiles/auth/start', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber, reauth }),
    }),
  saveProfileDraft: (phoneNumber: string) =>
    request<{ profileId: string; draft: boolean }>('/api/v1/profiles/auth/draft', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),
  verifyProfileIdentity: (challengeId: string, token: string) =>
    request<{ challengeId: string; identityVerified: boolean }>('/api/v1/profiles/auth/verify-identity', {
      method: 'POST',
      body: JSON.stringify({ challengeId, token }),
    }),
  completeProfileAuth: (challengeId: string, pin: string) =>
    request<{ id?: string; challengeId?: string; otpRequired?: boolean; phoneNumber?: string; provider?: string; fcmStatus?: string }>(
      '/api/v1/profiles/auth/complete',
      { method: 'POST', body: JSON.stringify({ challengeId, pin }) },
    ),
  verifyProfileAuth: (challengeId: string, otp: string) =>
    request<ProfileSummary>('/api/v1/profiles/auth/verify', { method: 'POST', body: JSON.stringify({ challengeId, otp }) }),
  resendProfileAuth: (challengeId: string) =>
    request<{ challengeId: string }>('/api/v1/profiles/auth/resend', { method: 'POST', body: JSON.stringify({ challengeId }) }),
  cancelProfileAuth: (challengeId: string) => request<void>(`/api/v1/profiles/auth/${challengeId}`, { method: 'DELETE' }),

  transactions: () => request<Transaction[]>('/api/v1/transactions'),
  notifications: (limit = 100) => request<Notification[]>(`/api/v1/notifications${queryString({ limit })}`),
  profileTransactions: (id: string, options: { limit?: number; offset?: number; direction?: string; status?: string; q?: string } = {}) =>
    request<TransactionPage>(`/api/v1/profiles/${id}/transactions${queryString({ ...options, paged: true })}`),
  profileNotifications: (id: string, options: { limit?: number; offset?: number; unread?: boolean } = {}) =>
    request<Notification[]>(`/api/v1/profiles/${id}/notifications${queryString(options)}`),
  markNotificationRead: (profileId: string, notificationId: string) =>
    request<void>(`/api/v1/profiles/${profileId}/notifications/${notificationId}/read`, { method: 'POST' }),
  markAllNotificationsRead: (profileId: string) =>
    request<void>(`/api/v1/profiles/${profileId}/notifications/read`, { method: 'POST' }),

  syncProfile: (id: string) => request<{ profileId: string; status: string }>(`/api/v1/profiles/${id}/sync`, { method: 'POST' }),
  enableFCM: (id: string) => request<{ profileId: string; enabled: boolean; status: string }>(`/api/v1/profiles/${id}/fcm/enable`, { method: 'POST' }),
  disableFCM: (id: string) => request<{ profileId: string; enabled: boolean; status: string }>(`/api/v1/profiles/${id}/fcm/disable`, { method: 'POST' }),
  fcmStatus: (id: string) => request<FCMStatus>(`/api/v1/profiles/${id}/fcm/status`),

  services: () => request<Service[]>('/api/v1/services'),
  service: (id: string) => request<Service>(`/api/v1/services/${id}`),
  createService: (name: string, callbackUrl: string, description = '') =>
    request<Service>('/api/v1/services', { method: 'POST', body: JSON.stringify({ name, callbackUrl, description }) }),
  updateService: (id: string, values: { name?: string; description?: string; callbackUrl?: string; active?: boolean }) =>
    request<{ id: string }>(`/api/v1/services/${id}`, { method: 'PATCH', body: JSON.stringify(values) }),
  deleteService: (id: string) => request<void>(`/api/v1/services/${id}`, { method: 'DELETE' }),
  serviceProfiles: (id: string) => request<ServiceProfile[]>(`/api/v1/services/${id}/profiles`),
  assignServiceProfile: (serviceId: string, profileId: string) =>
    request<void>(`/api/v1/services/${serviceId}/profiles`, { method: 'POST', body: JSON.stringify({ profileId }) }),
  detachServiceProfile: (serviceId: string, profileId: string) =>
    request<void>(`/api/v1/services/${serviceId}/profiles/${profileId}`, { method: 'DELETE' }),
  rotateServiceSecret: (serviceId: string) =>
    request<{ id: string; secret: string }>(`/api/v1/services/${serviceId}/secret/rotate`, { method: 'POST' }),
  serviceIntents: (serviceId: string) => request<Intent[]>(`/api/v1/services/${serviceId}/intents`),
  createServiceIntent: (
    serviceId: string,
    values: { profileId: string; phoneNumber?: string; amount?: number; currency?: string; reference?: string; expiresInMinutes?: number },
  ) => request<{ id: string; status: string }>(`/api/v1/services/${serviceId}/intents`, { method: 'POST', body: JSON.stringify(values) }),
  cancelServiceIntent: (serviceId: string, intentId: string) =>
    request<void>(`/api/v1/services/${serviceId}/intents/${intentId}`, { method: 'DELETE' }),
  serviceDeliveries: (serviceId: string) => request<Delivery[]>(`/api/v1/services/${serviceId}/deliveries`),

  adminUsers: () => request<AdminUser[]>('/api/v1/admin/users'),
  adminUser: (id: string) => request<AdminUserDetail>(`/api/v1/admin/users/${id}`),
  adminRoles: () => request<Role[]>('/api/v1/admin/roles'),
  role: (id: string) => request<RoleDetail>(`/api/v1/admin/roles/${id}`),
  permissionsList: () => request<string[]>('/api/v1/admin/permissions'),
  profileAccess: () => request<ProfileAccess[]>('/api/v1/admin/profile-access'),
  createAdminUser: (email: string, password: string) =>
    request<{ id: string; email: string }>('/api/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password }) }),
  deleteAdminUser: (id: string) => request<void>(`/api/v1/admin/users/${id}`, { method: 'DELETE' }),
  updateAdminUser: (id: string, values: { disabled?: boolean; password?: string }) =>
    request<void>(`/api/v1/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(values) }),
  assignRole: (userId: string, roleId: string) =>
    request<void>('/api/v1/admin/user-roles', { method: 'POST', body: JSON.stringify({ userId, roleId }) }),
  revokeUserRole: (userId: string, roleId: string) =>
    request<void>(`/api/v1/admin/user-roles/${userId}/${roleId}`, { method: 'DELETE' }),
  createRole: (name: string, description = '') =>
    request<{ id: string }>(`/api/v1/admin/roles`, { method: 'POST', body: JSON.stringify({ name, description }) }),
  deleteRole: (id: string) => request<void>(`/api/v1/admin/roles/${id}`, { method: 'DELETE' }),
  attachRolePermission: (roleId: string, permission: string) =>
    request<void>(`/api/v1/admin/roles/${roleId}/permissions`, { method: 'POST', body: JSON.stringify({ permission }) }),
  detachRolePermission: (roleId: string, permission: string) =>
    request<void>(`/api/v1/admin/roles/${roleId}/permissions/${encodeURIComponent(permission)}`, { method: 'DELETE' }),
  grantProfileAccess: (userId: string, profileId: string) =>
    request<void>('/api/v1/admin/profile-access', { method: 'POST', body: JSON.stringify({ userId, profileId }) }),
  revokeProfileAccess: (userId: string, profileId: string) =>
    request<void>(`/api/v1/admin/profile-access/${userId}/${profileId}`, { method: 'DELETE' }),
};
