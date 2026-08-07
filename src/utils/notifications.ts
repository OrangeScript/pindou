export const APP_NOTIFICATION_EVENT = 'lazarus:notification';

export type NotificationTone = 'info' | 'success' | 'warning' | 'error';

export interface AppNotificationDetail {
  message: string;
  tone: NotificationTone;
}

export function notify(message: string, tone: NotificationTone = 'info'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AppNotificationDetail>(APP_NOTIFICATION_EVENT, {
    detail: { message, tone },
  }));
}
