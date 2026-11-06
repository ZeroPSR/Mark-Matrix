// apps/web/src/components/BrandMark/BrandMark.tsx
import type { CSSProperties } from "react";
import markUrl from "../../assets/MarkMatrixMark.png";
import styles from "./BrandMark.module.css";

export interface BrandMarkProps {
  /** The chip's edge length in pixels. */
  size?: number;
  /**
   * The accessible name for the mark. Leave it null when the mark sits
   * beside the wordmark, which already names the product — the mark is then
   * decorative, and is hidden from assistive technology rather than
   * announced a second time.
   */
  label?: string | null;
}

/**
 * The Mark-Matrix mark on its own dark chip.
 *
 * The mark is a light-and-purple render whose white ribbon is legible on a
 * dark surface and nearly invisible on paper, so it never sits directly on
 * the page — it always sits on the chip, in either theme.
 */
export function BrandMark({ size = 28, label = null }: BrandMarkProps): JSX.Element {
  return (
    <span className={styles["chip"]} style={{ "--brand-mark-size": `${size}px` } as CSSProperties}>
      <img className={styles["mark"]} src={markUrl} alt={label ?? ""} />
    </span>
  );
}
