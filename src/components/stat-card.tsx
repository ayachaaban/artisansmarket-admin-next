import { cn } from '@/lib/utils';

const ICON_GRADIENTS = {
  default: 'bg-gradient-to-br from-[#6F8FA3] to-[#5A7A8D]',
  success: 'bg-gradient-to-br from-[#7FB07F] to-[#5E8E5E]',
  warning: 'bg-gradient-to-br from-[#E3A93C] to-[#C8862A]',
  danger: 'bg-gradient-to-br from-[#C96A3D] to-[#A44A3F]',
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[var(--border-color)] bg-white p-5 shadow-[var(--shadow-sm)] transition-all duration-300 hover:-translate-y-0.5 hover:border-transparent hover:shadow-[var(--shadow-lg)]">
      {Icon && (
        <div
          className={cn(
            'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-white shadow-[0_4px_12px_rgba(0,0,0,0.12)]',
            ICON_GRADIENTS[tone],
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[1.75rem] font-extrabold leading-none tracking-tight text-[var(--text-dark)]">
          {value}
        </p>
        <p className="mt-1.5 text-sm font-medium text-[var(--text-light)]">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-[var(--text-light)]">{hint}</p>}
      </div>
    </div>
  );
}
