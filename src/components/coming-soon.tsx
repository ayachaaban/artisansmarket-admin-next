import { Construction } from 'lucide-react';

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="px-8 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-20 text-center">
        <Construction className="mb-3 h-10 w-10 text-slate-400" />
        <p className="text-sm font-medium text-slate-700">Coming soon</p>
        <p className="mt-1 max-w-md text-sm text-slate-500">
          This page hasn&apos;t been ported to the new admin yet. Use the legacy admin for{' '}
          {title.toLowerCase()} for now.
        </p>
      </div>
    </div>
  );
}
