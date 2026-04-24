/**
 * CSS variables that bridge Panda's preflight (which uses `--global-font-body`
 * / `--global-font-mono`) with the generated `--fonts-*` token vars.
 *
 * In a full-page app these live on `:root` (see ds-helpers Ladle CSS).
 * When the theme is scoped to a subtree, the preset places them on the scope
 * root so preflight can resolve them.
 *
 * `--global-font-body` and `--global-font-mono` reference the Panda token vars
 * (`--fonts-body`, `--fonts-mono`), so they automatically reflect whatever the
 * consumer sets for `fonts.body` / `fonts.mono` — no separate override needed.
 *
 * `--font-inter` / `--font-inter-tight` are the raw variable-font stacks that
 * the token definitions reference (`fonts.body` = `var(--font-inter), …`).
 * Consumers must import the corresponding `@fontsource-variable/*` packages
 * so the `@font-face` rules exist.
 */
export const fontPipelineCssVars = {
  "--font-inter":
    '"Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif',
  "--font-inter-tight":
    '"Inter Tight Variable", "Inter Tight", ui-sans-serif, system-ui, sans-serif',
  "--global-font-body": "var(--fonts-body)",
  "--global-font-mono": "var(--fonts-mono)",
} as const;

/**
 * Default document surface styles applied to `html, body` by the preset.
 *
 * Sets the default color palette, font family, background, text color, and
 * the density / roundness / leading factor custom properties.
 */
export const documentSurfaceStyles = {
  colorPalette: "neutral",
  focusRingColor: "colorPalette.bd.solid",
  fontFamily: "body",
  bg: "neutral.s00",
  color: "fg.heading",
  "--roundness-factor": "1",
  "--leading-factor": "1",
  "--density-factor": "1",
} as const;
