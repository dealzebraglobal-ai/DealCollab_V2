'use client';
import { useEffect } from 'react';

/**
 * Security Shield: Suppress noise and interference from browser extensions 
 * (like MetaMask) that the app does not use.
 */
export function ExtensionNoiseReducer() {
  useEffect(() => {
    // Helper to check if an error message is from a known extension
    const isExtensionError = (msg: string) => {
      if (!msg) return false;
      const lowerMsg = msg.toLowerCase();
      return (
        lowerMsg.includes('chrome-extension://') || 
        lowerMsg.includes('metamask') ||
        lowerMsg.includes('ethereum')
      );
    };

    // 1. Suppress console errors from extensions
    const originalConsoleError = console.error;
    console.error = (...args) => {
      const msg = args[0]?.toString() || '';
      if (isExtensionError(msg)) return;
      originalConsoleError.apply(console, args);
    };

    // 2. Suppress unhandled rejections from extensions
    const handleRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.stack || event.reason?.message || '';
      if (isExtensionError(msg)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    // 3. Suppress standard errors from extensions
    const handleError = (event: ErrorEvent) => {
      const msg = event.error?.stack || event.error?.message || event.message || '';
      if (isExtensionError(msg)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    // Use capture phase to intercept before Next.js error boundary
    window.addEventListener('unhandledrejection', handleRejection, true);
    window.addEventListener('error', handleError, true);
    
    return () => {
      console.error = originalConsoleError;
      window.removeEventListener('unhandledrejection', handleRejection, true);
      window.removeEventListener('error', handleError, true);
    };
  }, []);

  return null;
}
