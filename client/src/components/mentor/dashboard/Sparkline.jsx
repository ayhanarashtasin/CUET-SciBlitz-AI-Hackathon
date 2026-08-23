/**
 * Sparkline — a tiny inline trend chart for a student's recent score series.
 *
 * Below two points it renders nothing. An empty chart affordance (the old
 * dashed baseline) implied data that did not exist; callers show the
 * last-activity timestamp instead.
 */
export default function Sparkline({ data = [], width = 96, height = 30, tone = 'steady' }) {
  const series = Array.isArray(data) ? data.filter((v) => Number.isFinite(v)) : [];
  if (series.length < 2) return null;

  const max = Math.max(...series, 100);
  const min = Math.min(...series, 0);
  const range = max - min || 1;
  const stepX = width / (series.length - 1);

  const points = series.map((value, index) => {
    const x = index * stepX;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return [x, y];
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg className={`mc-sparkline mc-sparkline--${tone}`} width={width} height={height} aria-hidden="true">
      <path d={linePath} className="mc-sparkline__line" />
      <circle cx={lastX} cy={lastY} r="2" className="mc-sparkline__dot" />
    </svg>
  );
}
