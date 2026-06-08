export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="d-flex justify-content-between align-items-end mb-3 flex-wrap" style={{ gap: 10 }}>
      <div>
        <h2 className="page-title mb-0">{title}</h2>
        {subtitle && (
          <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
            {subtitle}
          </p>
        )}
      </div>
      <div className="d-flex" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {children}
      </div>
    </div>
  );
}
