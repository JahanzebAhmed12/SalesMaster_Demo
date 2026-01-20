import { useEffect, useCallback } from 'react';
import { useAutoLogout } from './useAutoLogout';

/**
 * Hook to track form activity and prevent auto-logout during form filling
 * Use this in long forms to ensure users don't get logged out while actively working
 */
export const useFormActivityTracker = () => {
  const { resetTimer } = useAutoLogout();

  const trackActivity = useCallback(() => {
    // Debug logging (can be removed in production)
    if (process.env.NODE_ENV === 'development') {
      console.log('Form activity tracker: Activity detected', new Date().toLocaleTimeString());
    }
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    // Form-specific events that should reset the auto-logout timer
    const formEvents = [
      'input',
      'change',
      'focus',
      'blur',
      'keydown',
      'keyup',
      'keypress',
      'paste',
      'cut',
      'select'
    ];

    // Add event listeners to track form activity
    formEvents.forEach(event => {
      document.addEventListener(event, trackActivity, { 
        passive: true, 
        capture: true 
      });
    });

    // Also track mouse activity within forms
    const mouseEvents = ['click', 'mousedown', 'mouseup'];
    mouseEvents.forEach(event => {
      document.addEventListener(event, trackActivity, { 
        passive: true, 
        capture: true 
      });
    });

    return () => {
      // Cleanup event listeners
      formEvents.forEach(event => {
        document.removeEventListener(event, trackActivity, { capture: true });
      });
      
      mouseEvents.forEach(event => {
        document.removeEventListener(event, trackActivity, { capture: true });
      });
    };
  }, [trackActivity]);

  // Return the trackActivity function so forms can manually trigger it if needed
  return {
    trackActivity,
  };
};