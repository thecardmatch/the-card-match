type Props = {
  values: number[];
  width?: number;
  height?: number;
};

export function Sparkline({ values, width = 70, height = 22 }: Props) {
  if (!values || values.length < 2) {
    return <div style={{ width, height }} />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  const pct = (delta / first) * 100;

  // Inline hex colors so the sparkline renders identically regardless
  // of theme tokens — green for up, red for down, gray for flat.
  const color = delta > 0 ? "#16a34a" : delta < 0 ? "#dc2626" : "#9ca3af";

  const areaPath =
    `M0,${height} L` + points.join(" L") + ` L${width},${height} Z`;
  const linePath = `M` + points.join(" L");

  return (
    <div className="flex items-center gap-1.5">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        aria-label="Price trend"
      >
        <path d={areaPath} fill={color} fillOpacity={0.12} />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="text-[10px] font-bold tabular-nums"
        style={{ color }}
      >
        {delta >= 0 ? "+" : ""}
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}
