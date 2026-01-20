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
  const lastActivityRef = useRef<number>(Date.now());

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
    
    // Update last activity time
    lastActivityRef.current = Date.now();

    // Only set timers if user is logged in
    if (!user) return;

    // Set warning timer (4 minutes)
    warningTimeoutRef.current = setTimeout(() => {
      if (!warningShownRef.current) {
        warningShownRef.current = true;
        
        // Dispatch custom event for session status component
        window.dispatchEvent(new CustomEvent('session-warning'));
        
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
      // Double-check if there was recent activity before logging out
      const timeSinceLastActivity = Date.now() - lastActivityRef.current;
      if (timeSinceLastActivity >= IDLE_TIME) {
        toast({
          title: "Session Expired",
          description: "You have been logged out due to inactivity.",
          variant: "destructive",
          duration: 5000,
        });
        logout();
      } else {
        // If there was recent activity, reset the timer
        resetTimer();
      }
    }, IDLE_TIME);
  }, [user, logout, toast]);

  const handleActivity = useCallback((event?: Event) => {
    // Only reset timer if user is logged in
    if (user) {
      // Throttle activity detection to avoid excessive timer resets
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityRef.current;
      
      // Only reset if it's been more than 1 second since last activity
      if (timeSinceLastActivity > 1000) {
        // Debug logging (can be removed in production)
        if (process.env.NODE_ENV === 'development') {
          console.log('Auto-logout: Activity detected', event?.type, new Date().toLocaleTimeString());
        }
        
        // Dispatch custom event for session status component
        window.dispatchEvent(new CustomEvent('session-reset'));
        resetTimer();
      }
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

    // Comprehensive list of events that indicate user activity
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'keydown',
      'keyup',
      'scroll',
      'touchstart',
      'touchmove',
      'touchend',
      'click',
      'dblclick',
      'contextmenu',
      'wheel',
      'input',
      'change',
      'focus',
      'blur'
    ];

    // Add event listeners with passive option for better performance
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { 
        passive: true, 
        capture: true 
      });
    });

    // Also listen for form-specific events on the window
    const formEvents = ['input', 'change', 'focus', 'blur'];
    formEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { 
        passive: true, 
        capture: true 
      });
    });

    // Start the timer
    resetTimer();

    // Cleanup function
    return () => {
      // Remove event listeners
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, { capture: true });
      });
      
      formEvents.forEach(event => {
        window.removeEventListener(event, handleActivity, { capture: true });
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