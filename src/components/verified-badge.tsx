import { BadgeCheck, MailWarning } from 'lucide-react';
import { cn } from '@/lib/utils';

export function VerifiedBadge({
  verified,
  compact = false,
  hideWhenUnverified = false,
  className,
}: {
  verified: boolean;
  compact?: boolean;
  hideWhenUnverified?: boolean;
  className?: string;
}) {
  if (!verified && hideWhenUnverified) return null;

  if (compact) {
    return (
      <span
        title={verified ? 'Email verified' : 'Email not verified'}
        className={cn('inline-flex', className)}
      >
        {verified ? (
          <BadgeCheck className="h-4 w-4 text-emerald-600" />
        ) : (
          <MailWarning className="h-4 w-4 text-amber-600" />
        )}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        verified
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700',
        className,
      )}
    >
      {verified ? (
        <BadgeCheck className="h-3.5 w-3.5" />
      ) : (
        <MailWarning className="h-3.5 w-3.5" />
      )}
      {verified ? 'Email verified' : 'Email not verified'}
    </span>
  );
}
