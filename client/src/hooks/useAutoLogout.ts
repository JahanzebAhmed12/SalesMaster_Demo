import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

const IDLE_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds
const WARNING_TIME = 4 * 60 * 1000; // Show warning at 4 minutes

export const useAutoLogout = () => {
  const { logout, user } = useAuth();
  const { toast } = useToast();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningShownRef = useRef(false);

  const resetTimer = useCallback(() => {
    // Clear existing timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    
    // Reset warning flag
    warningShownRef.current = false;

    // Only set timers if user is logged in
    if (!user) return;

    // Set warning timer (4 minutes)
    warningTimeoutRef.current = setTimeout(() => {
      if (!warningShownRef.current) {
        warningShownRef.current = true;
        toast({
          title: "Session Warning",
          description: "You will be logged out in 1 minute due to inactivity. Move your mouse or click anywhere to stay logged in.",
          variant: "destructive",
          duration: 10000, // Show for 10 seconds
        });
      }
    }, WARNING_TIME);

    // Set logout timer (5 minutes)
    timeoutRef.current = setTimeout(() => {
      toast({
        title: "Session Expired",
        description: "You have been logged out due to inactivity.",
        variant: "destructive",
        duration: 5000,
      });
      logout();
    }, IDLE_TIME);
  }, [user, logout, toast]);

  const handleActivity = useCallback(() => {
    // Only reset timer if user is logged in
    if (user) {
      resetTimer();
    }
  }, [user, resetTimer]);

  useEffect(() => {
    // Only start tracking if user is logged in
    if (!user) {
      // Clear timers if user logs out
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      return;
    }

    // List of events that indicate user activity
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
      'keydown'
    ];

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });

    // Start the timer
    resetTimer();

    // Cleanup function
    return () => {
      // Remove event listeners
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });

      // Clear timers
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, [user, handleActivity, resetTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, []);

  return {
    resetTimer: handleActivity, // Expose function to manually reset timer if needed
  };
};