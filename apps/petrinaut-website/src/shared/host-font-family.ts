/**
 * The font for the site's own chrome outside `.petrinaut-root`, where the
 * design-system tokens are not declared. It follows the font the site gives
 * Petrinaut through `--salt-font-body`, and is the system font without one.
 */
export const hostFontFamily =
  "var(--salt-font-body, ui-sans-serif), system-ui, sans-serif";
