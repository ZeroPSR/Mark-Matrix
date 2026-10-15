import styles from "./DotPlot.module.css";

export interface DotPlotProps {
  values: number[];
  ariaLabel: string;
}

export function DotPlot({ values, ariaLabel }: DotPlotProps): JSX.Element {
  const w = 360;
  const h = 80;
  const pad = 12;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return (
    <svg className={styles.svg} viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={ariaLabel}>
      <line className={styles.axis} x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} />
      {values.map((v, i) => {
        const x = pad + (i * (w - pad * 2)) / Math.max(values.length - 1, 1);
        const y = h - pad - ((v - min) / range) * (h - pad * 2);
        return <circle key={i} className={styles.dot} cx={x} cy={y} r={3} />;
      })}
    </svg>
  );
}
