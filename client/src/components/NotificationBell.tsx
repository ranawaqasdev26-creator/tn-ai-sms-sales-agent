import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { api, AppNotification } from '../api';
import { useWebSocket } from '../hooks/useWebSocket';

type Toast = {
  id: string;
  title: string;
  body: string;
  conversationId?: string;
};

function playAlertTone() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      void ctx.close();
    }, 180);
  } catch {
    /* ignore */
  }
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [ring, setRing] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const load = useCallback(() => {
    api.getNotifications().then((data) => {
      setNotifications(data.notifications);
      setUnread(data.unreadCount);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const pushDesktop = (title: string, body: string, conversationId?: string) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification(title, {
      body,
      icon: '/vite.svg',
      tag: conversationId || 'escalation',
    });
    n.onclick = () => {
      window.focus();
      if (conversationId) window.location.href = `/conversations?id=${conversationId}`;
      n.close();
    };
  };

  const handleWSEvent = useCallback(
    (event: { event: string; data: unknown }) => {
      if (event.event === 'notification' || event.event === 'escalation') {
        load();
        setRing(true);
        setTimeout(() => setRing(false), 1600);
        playAlertTone();

        const data = (event.data || {}) as Record<string, unknown>;
        const leadName = typeof data.leadName === 'string' ? data.leadName : '';
        const title =
          event.event === 'escalation'
            ? '🚨 Escalation Required'
            : typeof data.title === 'string'
              ? data.title
              : 'New notification';
        const body =
          event.event === 'escalation'
            ? `${leadName ? `${leadName}: ` : ''}${
                typeof data.reason === 'string' ? data.reason : 'Lead requested a human agent'
              }`
            : typeof data.body === 'string'
              ? data.body
              : 'Open the dashboard to review';
        const conversationId =
          typeof data.conversationId === 'string'
            ? data.conversationId
            : typeof data.conversation_id === 'string'
              ? data.conversation_id
              : undefined;


        setToast({
          id: `${Date.now()}`,
          title,
          body,
          conversationId,
        });
        pushDesktop(title, body, conversationId);
      }

      if (event.event === 'escalation_email') {
        const data = event.data as { previewUrl?: string; to?: string; sent?: boolean };
        if (data?.previewUrl) {
          console.info('[Escalation email preview]', data.previewUrl);
        }
      }
    },
    [load]
  );

  useWebSocket(handleWSEvent);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 10000);
    return () => clearTimeout(t);
  }, [toast]);

  const markRead = async (id: string) => {
    await api.markNotificationRead(id);
    load();
  };

  const markAllRead = async () => {
    await api.markAllNotificationsRead();
    load();
  };

  return (
    <div className="relative">
      {toast && (
        <div className="fixed top-4 right-4 z-[100] w-[360px] max-w-[calc(100vw-2rem)] animate-in">
          <div className="rounded-2xl border border-amber-300 bg-amber-50 shadow-luxury-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-950 text-sm">{toast.title}</p>
                <p className="text-xs text-amber-900/80 mt-1 line-clamp-3">{toast.body}</p>
                {toast.conversationId && (
                  <Link
                    to={`/conversations?id=${toast.conversationId}`}
                    onClick={() => setToast(null)}
                    className="inline-block mt-3 text-xs font-semibold text-navy-800 underline"
                  >
                    Open conversation →
                  </Link>
                )}
              </div>
              <button
                onClick={() => setToast(null)}
                className="p-1 rounded-lg hover:bg-amber-100 text-amber-800"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          setOpen(!open);
          if (!open) load();
        }}
        className={`relative p-2.5 rounded-xl hover:bg-luxury-100 border border-transparent hover:border-luxury-200 transition-all ${
          ring ? 'animate-bounce bg-amber-50 border-amber-300' : ''
        }`}
        title="Notifications"
      >
        <Bell className={`w-5 h-5 ${unread > 0 || ring ? 'text-amber-600' : 'text-luxury-600'}`} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-gold-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow-gold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 card z-50 shadow-luxury-lg">
          <div className="p-3 border-b border-luxury-200 flex items-center justify-between">
            <span className="font-semibold text-sm text-luxury-800">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-gold-600 hover:text-gold-700 font-medium">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-luxury-150">
            {notifications.length === 0 ? (
              <p className="p-4 text-sm text-luxury-400 text-center">No notifications</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 hover:bg-luxury-50 ${n.read ? 'opacity-60' : ''} ${
                    n.type === 'escalation' ? 'bg-amber-50/60' : ''
                  }`}
                  onClick={() => !n.read && markRead(n.id)}
                >
                  {n.conversation_id ? (
                    <Link
                      to={`/conversations?id=${n.conversation_id}`}
                      onClick={() => setOpen(false)}
                      className="block"
                    >
                      <p className="text-sm font-medium text-luxury-800">
                        {n.type === 'escalation' ? '🚨 ' : ''}
                        {n.title}
                      </p>
                      <p className="text-xs text-luxury-500 mt-0.5 line-clamp-2">{n.body}</p>
                    </Link>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-luxury-800">{n.title}</p>
                      <p className="text-xs text-luxury-500 mt-0.5">{n.body}</p>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
