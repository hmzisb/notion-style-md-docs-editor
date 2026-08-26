import { useEffect } from 'react';
import { toast as sonnerToast } from 'sonner';
import { drainToasts, releaseToasts } from '@/lib/toast.js';
import { Toaster } from './sonner';

/**
 * docs/07 section 10: bottom-right, 4 s. A chunk of its own on the ASM-063 shape - `sonner` is
 * the biggest thing left in the shell entry and no reader pays for it until something toasts.
 */
export function ToastSurface(): React.JSX.Element {
  // After the mount, so the toaster below is subscribed before the queue is handed over, and
  // released on the way out: a shell that unmounts leaves nothing to show the next message.
  useEffect(() => {
    drainToasts((message) => {
      sonnerToast(message);
    });
    return releaseToasts;
  }, []);

  return <Toaster position="bottom-right" duration={4000} />;
}
