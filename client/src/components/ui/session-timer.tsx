import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';

const SESSION_DURATION = 5 * 60 * 1000; // 5 minutes

export const SessionTimer = () => {
  const { user } = useAuth();
  const [timeLeft, setTimeLeft] = useState<number>(SESSION_DURATION);

  // Use a ref for lastActivity so the interval callback always reads
  // the latest value without needing to be recreated.
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!user) return;

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = [
      'mousedown', 'mousemove', 'keypress', 'scroll',
      'touchstart', 'click', 'keydown', 'input', 'change',
    ];

    events.forEach(ev => document.addEventListener(ev, handleActivity, true));

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, SESSION_DURATION - elapsed);
      setTimeLeft(remaining);
    }, 1000);

    return () => {
      events.forEach(ev => document.removeEventListener(ev, handleActivity, true));
      clearInterval(interval);
    };
  }, [user]); // Only re-run when login state changes

  if (!user) return null;

  // Only show the badge when fewer than 2 minutes remain
  if (timeLeft > 2 * 60 * 1000) return null;

  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  const isWarning = timeLeft <= 60000;

  return (
    <div className="fixed top-4 right-4 z-50">
      <Badge
        variant={isWarning ? 'destructive' : 'secondary'}
        className="animate-pulse"
      >
        Session: {minutes}:{seconds.toString().padStart(2, '0')}
      </Badge>
    </div>
  );
};
