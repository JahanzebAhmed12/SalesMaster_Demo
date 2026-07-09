import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

const IDLE_TIME = 5 * 60 * 1000;     // 5 minutes
const WARNING_TIME = 4 * 60 * 1000;  // warn at 4 minutes

export const useAutoLogout = () => {
  // Store everything in refs so callbacks are always stable and never
  // cause timer restarts simply because a dependency identity changed.
  const { logout, user } = useAuth();
  const { toast } = useToast();

  const logoutRef = useRef(logout);
  const toastRef = useRef(toast);
  const userRef = useRef(user);

  // Keep refs in sync with latest values without recreating callbacks
  useEffect(() => { logoutRef.current = logout; }, [logout]);
  useEffect(() => { toastRef.current = toast; }, [toast]);
  useEffect(() => { userRef.current = user; }, [user]);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef = useRef(false);

  // stable reset — never changes identity
  const resetTimer = useRef(() => {
    if (!userRef.current) return;

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    warningShownRef.current = false;
    lastActivityRef.current = Date.now();

    // Dispatch reset event for SessionStatus component
    window.dispatchEvent(new CustomEvent('session-reset'));

    // Warning at 4 minutes
    warningTimerRef.current = setTimeout(() => {
      if (warningShownRef.current) return;
      warningShownRef.current = true;
      window.dispatchEvent(new CustomEvent('session-warning'));
      toastRef.current({
        title: 'Session Warning',
        description: 'You will be logged out in 1 minute due to inactivity.',
        variant: 'destructive',
        duration: 10000,
      });
    }, WARNING_TIME);

    // Logout at 5 minutes — double-check real idle time before acting
    idleTimerRef.current = setTimeout(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= IDLE_TIME) {
        toastRef.current({
          title: 'Session Expired',
          description: 'You have been logged out due to inactivity.',
          variant: 'destructive',
          duration: 5000,
        });
        logoutRef.current();
      } else {
        // User was actually active — reset without triggering another warning
        resetTimer.current();
      }
    }, IDLE_TIME);
  }).current;

  // Stable activity handler — never recreated
  const handleActivity = useRef((e?: Event) => {
    if (!userRef.current) return;

    const now = Date.now();
    // Throttle: only react if >1 s has passed since last recorded activity
    if (now - lastActivityRef.current < 1000) return;

    resetTimer();
  }).current;

  useEffect(() => {
    if (!user) {
      // User logged out — clear all timers
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      return;
    }

    const events = [
      'mousedown', 'mousemove', 'keypress', 'keydown', 'keyup',
      'scroll', 'touchstart', 'touchmove', 'touchend',
      'click', 'dblclick', 'wheel', 'input', 'change', 'focus',
    ];

    events.forEach(ev => {
      document.addEventListener(ev, handleActivity, { passive: true, capture: true });
    });

    // Kick off the first timer
    resetTimer();

    return () => {
      events.forEach(ev => {
        document.removeEventListener(ev, handleActivity, { capture: true });
      });
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // Only re-run when login state changes — NOT on every render

  return { resetTimer: handleActivity };
};
