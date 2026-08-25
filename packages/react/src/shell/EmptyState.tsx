import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: string | undefined;
  action?: EmptyStateAction | undefined;
  secondaryAction?: EmptyStateAction | undefined;
  /** Rendered under the body: the folder card lists its children here (docs/06 §11). */
  children?: ReactNode;
  className?: string;
}

/** docs/06 section 11: one card for every empty and error situation in the content region. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  secondaryAction,
  children,
  className,
}: EmptyStateProps): React.JSX.Element {
  return (
    <div className={cn('flex h-full items-center justify-center p-8', className)}>
      <div className="max-w-sm text-center">
        <Icon aria-hidden="true" className="mx-auto mb-3 size-8 text-muted-foreground/60" />
        <h2 className="text-base font-medium">{title}</h2>
        {body !== undefined && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}
        {children}
        {(action ?? secondaryAction) !== undefined && (
          <div className="mt-4 flex items-center justify-center gap-2">
            {action !== undefined && <Button onClick={action.onClick}>{action.label}</Button>}
            {secondaryAction !== undefined && (
              <Button variant="outline" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
