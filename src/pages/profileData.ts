import { api, Notification, ProfileDetail } from '../api';
import type { StreamEvent } from '../components/layout/Shell';

export const alertFetchPageSize = 500;
export const alertFetchMax = 5000;

// A live stream frame can arrive while an initial page fetch is still in flight.
// Keep those newer rows when the fetch resolves instead of letting the snapshot
// overwrite them.
export function mergeById<T extends { id: string }>(fresh: T[], current: T[], limit?: number): T[] {
  const freshIds = new Set(fresh.map((item) => item.id));
  const live = current.filter((item) => !freshIds.has(item.id));
  const merged = [...live, ...fresh];
  return typeof limit === 'number' ? merged.slice(0, limit) : merged;
}

// eventNotification adapts a profile-scoped stream frame into the notification
// shape rendered by the overview and alerts pages.
export function eventNotification(event: StreamEvent, profile: ProfileDetail): Notification | null {
  const data = event.data ?? {};
  if (typeof data.id !== 'string') return null;
  return {
    id: data.id,
    profileId: event.profileId ?? profile.id,
    phoneNumber: profile.phoneNumber,
    title: String(data.title ?? 'MoMo alert'),
    body: String(data.body ?? ''),
    data: (data.data as Record<string, unknown> | undefined) ?? {},
    category: String((data.data as Record<string, unknown> | undefined)?.category ?? ''),
    receivedAt: String(data.receivedAt ?? event.at),
  };
}

export async function fetchAllNotifications(profileId: string): Promise<Notification[]> {
  const all: Notification[] = [];
  for (let offset = 0; offset < alertFetchMax; offset += alertFetchPageSize) {
    const page = await api.profileNotifications(profileId, { limit: alertFetchPageSize, offset });
    all.push(...page);
    if (page.length < alertFetchPageSize) break;
  }
  return all;
}
