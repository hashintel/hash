/**
 * CSS variables that bridge Panda's preflight (which uses `--global-font-body`
 * / `--global-font-mono`) with the generated `--fonts-*` token vars.
 *
 * In a full-page app these live on `:root` (see the Storybook preview CSS).
 * When the theme is scoped to a subtree, the preset places them on the scope
 * root so preflight can resolve them.
 *
 * `--global-font-body` and `--global-font-mono` reference the Panda token vars
 * (`--fonts-body`, `--fonts-mono`), so they automatically reflect whatever the
 * consumer sets for `fonts.body` / `fonts.mono` — no separate override needed.
 */
export const fontPipelineCssVars = {
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
