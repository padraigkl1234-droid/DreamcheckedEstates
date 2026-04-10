'use client';

import { useEffect } from 'react';

/**
 * This component fixes a known issue with Radix UI and React 18/19 
 * where 'releasePointerCapture' is called on an element that is no longer active.
 * This often happens in iframes or when components unmount rapidly.
 */
export function PointerCaptureFix() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalReleasePointerCapture = Element.prototype.releasePointerCapture;
    
    Element.prototype.releasePointerCapture = function(pointerId: number) {
      try {
        originalReleasePointerCapture.call(this, pointerId);
      } catch (error) {
        // Silently catch the "No active pointer with the given id" error
        // as it's a known benign issue with Radix UI unmounting.
        if (error instanceof Error && error.name === 'NotFoundError') {
          return;
        }
        throw error;
      }
    };

    return () => {
      Element.prototype.releasePointerCapture = originalReleasePointerCapture;
    };
  }, []);

  return null;
}
