import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

const IDLE_TIME = 5 * 60 * 1000;       // 5 minutes idle → logout
const WARNING_TIME = 4 * 60 * 1000;    // warn at 4 minutes
const TOKEN_REFRESH_INTERVAL = 30 * 60 * 1000; // refresh token every 30 minutes

export const useAutoLogout = () => {
  const { logout, user, refreshToken } = useAuth();
  const { toast } = useToast();

  const logoutRef = useRef(logout);
  const toastRef = useRef(toast);
  const userRef = useRef(user);
  const refreshTokenRef = useRef(refreshToken);

  useEffect(() => { logoutRef.current = logout; }, [logout]);
  useEffect(() => { toastRef.current = toast; }, [toast]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { refreshTokenRef.current = refreshToken; }, [refreshToken]);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef = useRef(false);

  const resetTimer = useRef(() => {
    if (!userRef.current) return;

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    warningShownRef.current = false;
    lastActivityRef.current = Date.now();

    window.dispatchEvent(new CustomEvent('session-reset'));

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
        resetTimer();
      }
    }, IDLE_TIME);
  }).current;

  const handleActivity = useRef((e?: Event) => {
    if (!userRef.current) return;
    const now = Date.now();
    if (now - lastActivityRef.current < 1000) return;
    resetTimer();
  }).current;

  useEffect(() => {
    if (!user) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (tokenRefreshIntervalRef.current) clearInterval(tokenRefreshIntervalRef.current);
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

    // Silently refresh the JWT token every 30 minutes while the user is logged in.
    // This prevents the token from expiring during a long working session.
    tokenRefreshIntervalRef.current = setInterval(async () => {
      if (!userRef.current) return;
      const success = await refreshTokenRef.current();
      if (!success) {
        console.warn('[Auth] Token refresh failed — user may be logged out soon');
      }
    }, TOKEN_REFRESH_INTERVAL);

    resetTimer();

    return () => {
      events.forEach(ev => {
        document.removeEventListener(ev, handleActivity, { capture: true });
      });
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (tokenRefreshIntervalRef.current) clearInterval(tokenRefreshIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return { resetTimer: handleActivity };
};
