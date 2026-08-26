import { Suspense, lazy, useEffect, useState } from 'react';
import { onToastQueued, toastsWaiting } from '@/lib/toast.js';

const Surface = lazy(async () => {
  const { ToastSurface } = await import('@/ui/toast-surface.js');
  return { default: ToastSurface };
});

/**
 * docs/07 section 10: the one toaster the shell mounts - as soon as there is a message for it,
 * and not before (docs/02 section 7).
 */
export function Toasts(): React.JSX.Element | null {
  const [live, setLive] = useState(toastsWaiting);
  useEffect(
    () =>
      onToastQueued(() => {
        setLive(true);
      }),
    [],
  );

  if (!live) return null;
  return (
    <Suspense fallback={null}>
      <Surface />
    </Suspense>
  );
}
