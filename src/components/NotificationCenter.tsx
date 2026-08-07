'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  APP_NOTIFICATION_EVENT,
  type AppNotificationDetail,
  type NotificationTone,
} from '../utils/notifications';

interface VisibleNotification extends AppNotificationDetail {
  id: number;
}

const toneClasses: Record<NotificationTone, string> = {
  info: 'border-[var(--atelier-blue)] bg-[#fffaf0]',
  success: 'border-emerald-600 bg-[var(--atelier-signal)]',
  warning: 'border-amber-600 bg-amber-100',
  error: 'border-red-700 bg-red-100',
};

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<VisibleNotification[]>([]);
  const nextIdRef = useRef(0);
  const timersRef = useRef(new Set<number>());

  const dismiss = useCallback((id: number) => {
    setNotifications(current => current.filter(notification => notification.id !== id));
  }, []);

  useEffect(() => {
    const handleNotification = (event: Event) => {
      const detail = (event as CustomEvent<AppNotificationDetail>).detail;
      if (!detail?.message) return;
      const id = ++nextIdRef.current;
      setNotifications(current => [...current.slice(-3), { ...detail, id }]);
      const timer = window.setTimeout(() => {
        dismiss(id);
        timersRef.current.delete(timer);
      }, detail.tone === 'error' ? 7000 : 4500);
      timersRef.current.add(timer);
    };

    window.addEventListener(APP_NOTIFICATION_EVENT, handleNotification);
    const timers = timersRef.current;
    return () => {
      window.removeEventListener(APP_NOTIFICATION_EVENT, handleNotification);
      timers.forEach(timer => window.clearTimeout(timer));
      timers.clear();
    };
  }, [dismiss]);

  if (notifications.length === 0) return null;

  return (
    <section
      aria-label="操作通知"
      aria-live="polite"
      className="pointer-events-none fixed right-3 top-3 z-[200] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2 sm:right-5 sm:top-5"
    >
      {notifications.map(notification => (
        <div
          key={notification.id}
          role={notification.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-start gap-3 border-2 p-3 font-mono text-sm font-bold text-[#1d1b18] shadow-[4px_4px_0_#1d1b18] ${toneClasses[notification.tone]}`}
        >
          <span className="min-w-0 flex-1 whitespace-pre-line leading-5">{notification.message}</span>
          <button
            type="button"
            onClick={() => dismiss(notification.id)}
            aria-label="关闭通知"
            className="-mr-1 -mt-1 h-8 w-8 flex-none text-lg"
          >
            ×
          </button>
        </div>
      ))}
    </section>
  );
}
