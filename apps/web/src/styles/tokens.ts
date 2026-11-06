export const colors = {
  paper:        "var(--color-paper)",
  ink:          "var(--color-ink)",
  inkSoft:      "var(--color-ink-soft)",
  hairline:     "var(--color-hairline)",
  surface:      "var(--color-surface)",
  surfaceSunk:  "var(--color-surface-sunk)",
  inkBlue:      "var(--color-ink-blue)",
  success:      "var(--color-success)",
  warning:      "var(--color-warning)",
  error:        "var(--color-error)",
  backdrop:     "var(--color-backdrop)",
  brandSurface: "var(--color-brand-surface)",
} as const;

export const type = {
  display:      "var(--type-display)",
  h1:           "var(--type-h1)",
  h2:           "var(--type-h2)",
  h3:           "var(--type-h3)",
  body:         "var(--type-body)",
  small:        "var(--type-small)",
  mono:         "var(--type-mono)",
} as const;

export const space = {
  s1: "var(--space-1)",
  s2: "var(--space-2)",
  s3: "var(--space-3)",
  s4: "var(--space-4)",
  s5: "var(--space-5)",
  s6: "var(--space-6)",
  s7: "var(--space-7)",
  s8: "var(--space-8)",
  s9: "var(--space-9)",
} as const;

export const radius = {
  pill:   "var(--radius-pill)",
  button: "var(--radius-button)",
} as const;

export const motion = {
  fast: "var(--motion-fast)",
} as const;

export const breakpoints = {
  sm: 640,
  md: 1024,
  lg: 1024,
} as const;

export type ColorToken = keyof typeof colors;
export type SpaceToken = keyof typeof space;
export type TypeToken = keyof typeof type;