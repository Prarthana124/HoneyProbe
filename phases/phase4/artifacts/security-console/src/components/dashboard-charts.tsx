export type ActivityPoint = {
  label: string;
  value: number;
};

export type DistributionPoint = {
  label: string;
  value: number;
  color: string;
};

export function ActivityBars({
  data,
  ariaLabel,
  emptyLabel = 'No activity is available for this period.',
}: {
  data: ActivityPoint[];
  ariaLabel: string;
  emptyLabel?: string;
}) {
  const maximum = Math.max(1, ...data.map((point) => point.value));

  if (data.length === 0) {
    return (
      <div className="rounded border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      className="dashboard-bars"
      role="img"
      aria-label={ariaLabel}
      style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}
    >
      {data.map((point, index) => (
        <div className="dashboard-bar-column" key={`${point.label}-${index}`} title={`${point.label}: ${point.value}`}>
          <span className="dashboard-bar-value">{point.value}</span>
          <div className="dashboard-bar-track">
            <div
              className="dashboard-bar-fill"
              style={{ height: `${Math.max(3, (point.value / maximum) * 100)}%` }}
            />
          </div>
          <span className="dashboard-bar-label">{point.label}</span>
        </div>
      ))}
    </div>
  );
}

export function DistributionRing({
  data,
  centerLabel,
  ariaLabel,
}: {
  data: DistributionPoint[];
  centerLabel: string;
  ariaLabel: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const stops = data
    .filter((item) => item.value > 0)
    .map((item) => {
      const start = cursor;
      cursor += (item.value / total) * 100;
      return `${item.color} ${start}% ${cursor}%`;
    });
  const background = total > 0
    ? `conic-gradient(from -90deg, ${stops.join(', ')})`
    : 'conic-gradient(hsl(var(--muted)) 0% 100%)';

  return (
    <div className="distribution-ring-layout">
      <div className="distribution-ring" role="img" aria-label={ariaLabel} style={{ background }}>
        <div className="distribution-ring-center">
          <strong>{total}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className="distribution-legend">
        {data.map((item) => (
          <li key={item.label}>
            <span className="distribution-swatch" style={{ backgroundColor: item.color }} />
            <span className="distribution-label">{item.label}</span>
            <span className="distribution-value">{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
