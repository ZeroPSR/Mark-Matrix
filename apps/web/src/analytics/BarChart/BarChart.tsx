import styles from "./BarChart.module.css";

export interface BarDatum { label: string; value: number }
export interface BarChartProps {
  data: BarDatum[];
  ariaLabel: string;
  max?: number;
}

export function BarChart({ data, ariaLabel, max }: BarChartProps): JSX.Element {
  const ceiling = Math.max(max ?? 0, ...data.map((d) => d.value), 1);
  const w = 360;
  const h = 160;
  const pad = 24;
  const barW = (w - pad * 2) / Math.max(data.length, 1) - 8;
  return (
    <>
      <svg
        className={styles["svg"]}
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        role="img"
        aria-label={ariaLabel}
      >
        <line className={styles["axis"]} x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} />
        {data.map((d, i) => {
          const bh = ((h - pad * 2) * d.value) / ceiling;
          const x = pad + i * ((w - pad * 2) / Math.max(data.length, 1)) + 4;
          const y = h - pad - bh;
          return (
            <g key={d.label}>
              <rect x={x} y={y} width={barW} height={bh} fill="currentColor" />
              <text className={styles["label"]} x={x + barW / 2} y={h - pad + 12} textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <table className={styles["sr"]}>
        <thead><tr><th>Label</th><th>Value</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td>{d.value}</td></tr>)}</tbody>
      </table>
    </>
  );
}
