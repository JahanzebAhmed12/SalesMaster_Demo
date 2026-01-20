import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle } from 'lucide-react';

interface SessionStatusProps {
  showInHeader?: boolean;
}

export const SessionStatus = ({ showInHeader = false }: SessionStatusProps) => {
  const { user } = useAuth();
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isWarning, setIsWarning] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Listen for session warning events
    const handleSessionWarning = () => {
      setIsWarning(true);
      setTimeLeft(60); // 1 minute left
    };

    const handleSessionReset = () => {
      setIsWarning(false);
      setTimeLeft(null);
    };

    // Custom events that can be dispatched from the auto-logout hook
    window.addEventListener('session-warning', handleSessionWarning);
    window.addEventListener('session-reset', handleSessionReset);

    return () => {
      window.removeEventListener('session-warning', handleSessionWarning);
      window.removeEventListener('session-reset', handleSessionReset);
    };
  }, [user]);

  useEffect(() => {
    if (!isWarning || timeLeft === null) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          setIsWarning(false);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isWarning, timeLeft]);

  if (!user || !isWarning) return null;

  if (showInHeader) {
    return (
      <Badge variant="destructive" className="animate-pulse">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Session expires in {timeLeft}s
      </Badge>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg animate-pulse">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        <span className="font-medium">Session Warning</span>
      </div>
      <div className="text-sm mt-1">
        Logging out in {timeLeft} seconds. Click anywhere to stay logged in.
      </div>
    </div>
  );
};