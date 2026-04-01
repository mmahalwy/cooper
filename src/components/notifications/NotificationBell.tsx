'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { BellIcon, CheckCheckIcon } from 'lucide-react';
import {
  getNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from '@/app/actions';
import { useRouter } from 'next/navigation';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  type: string;
  thread_id: string | null;
  is_read: boolean;
  created_at: string;
}

const TYPE_COLORS: Record<string, string> = {
  info: 'bg-blue-500',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const unreadCount = notifications.filter(n => !n.is_read).length;

  function load() {
    startTransition(async () => {
      const data = await getNotificationsAction();
      setNotifications(data);
    });
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  async function handleClick(notif: Notification) {
    if (!notif.is_read) {
      await markNotificationReadAction(notif.id);
      load();
    }
    if (notif.thread_id) {
      router.push(`/chat/${notif.thread_id}`);
      setOpen(false);
    }
  }

  async function markAllRead() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      load();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <BellIcon className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h4 className="text-sm font-medium">Notifications</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={markAllRead}>
              <CheckCheckIcon className="size-3" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-auto">
          {notifications.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No notifications</p>
          ) : (
            notifications.map((notif) => (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={`w-full text-left p-3 border-b last:border-0 hover:bg-muted transition-colors ${
                  !notif.is_read ? 'bg-primary/5' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`mt-1 size-2 rounded-full shrink-0 ${TYPE_COLORS[notif.type] || TYPE_COLORS.info}`} />
                  <div className="min-w-0">
                    <p className={`text-sm ${!notif.is_read ? 'font-medium' : ''}`}>{notif.title}</p>
                    {notif.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(notif.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
