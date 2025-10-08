import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';

const SESSION_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

export const SessionTimer = () => {
  const { user } = useAuth();
  const [timeLeft, setTimeLeft] = useState<number>(SESSION_DURATION);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());

  useEffect(() => {
    if (!user) return;

    // Track user activity
    const handleActivity = () => {
      setLastActivity(Date.now());
      setTimeLeft(SESSION_DURATION);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click', 'keydown'];
    
    events.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });

    // Update timer every second
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivity;
      const remaining = Math.max(0, SESSION_DURATION - elapsed);
      setTimeLeft(remaining);
    }, 1000);

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
      clearInterval(interval);
    };
  }, [user, lastActivity]);

  // Don't show timer if user is not logged in
  if (!user) return null;

  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);

  // Only show when less than 2 minutes remaining
  if (timeLeft > 2 * 60 * 1000) return null;

  const isWarning = timeLeft <= 60000; // Last minute

  return (
    <div className="fixed top-4 right-4 z-50">
      <Badge 
        variant={isWarning ? "destructive" : "secondary"}
        className="animate-pulse"
      >
        Session: {minutes}:{seconds.toString().padStart(2, '0')}
      </Badge>
    </div>
  );
};