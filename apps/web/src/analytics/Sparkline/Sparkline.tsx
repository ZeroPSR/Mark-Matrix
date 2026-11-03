import styles from "./Sparkline.module.css";

export interface SparklineProps {
  values: number[];
  ariaLabel: string;
}

export function Sparkline({ values, ariaLabel }: SparklineProps): JSX.Element {
  const w = 240;
  const h = 60;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(values.length - 1, 1);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  const last = values[values.length - 1] ?? min;
  const lx = pad + ((values.length - 1) * (w - pad * 2)) / Math.max(values.length - 1, 1);
  const ly = h - pad - ((last - min) / range) * (h - pad * 2);
  return (
    <svg className={styles["svg"]} viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={ariaLabel}>
      <polyline className={styles["line"]} points={points} />
      <circle className={styles["dot"]} cx={lx} cy={ly} r={2.5} />
    </svg>
  );
}
