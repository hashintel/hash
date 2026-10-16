/**
 * One SVG element, written with SVG attribute names (`stroke-width`, not
 * `strokeWidth`), so the same source renders as an SVG file and as React.
 */
export type SvgIconNode = readonly [
  tag: "path" | "circle" | "rect" | "g",
  attributes: Readonly<Record<string, string | number>>,
  children?: readonly SvgIconNode[],
];

/**
 * The single source of one icon: its geometry and the CSS that animates it.
 *
 * Every state lives in the same geometry. The CSS moves between states using
 * the inputs the host sets on the root `<svg>`:
 *
 * - `--ds-icon-progress` (0 to 1) for a progress value, as SF Symbols does.
 * - `data-run="odd" | "even"` for a one-shot. Flipping the value restarts it.
 * - `data-active` for an animation that loops until removed.
 */
export type SvgIconDefinition = {
  name: string;
  nodes: readonly SvgIconNode[];
  /** Rules scoped to `.ds-icon-<name>`. */
  css: string;
};

export const defineSvgIcon = (definition: SvgIconDefinition) => definition;

export const svgIconClassName = (name: string) => `ds-icon ds-icon-${name}`;

/** Shared rules every icon needs. Size and weight come from the context. */
export const svgIconBaseCss = `
.ds-icon {
  width: var(--ds-icon-size, 1em);
  height: var(--ds-icon-size, 1em);
  flex-shrink: 0;
  fill: none;
  stroke: currentColor;
  stroke-width: calc(1 + (var(--ds-icon-weight, 400) - 100) / 300);
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ds-icon * {
  transform-box: view-box;
  transform-origin: 12px 12px;
}
.ds-icon[data-variant="filled"] [data-fill] {
  fill: currentColor;
}
@media (prefers-reduced-motion: reduce) {
  .ds-icon,
  .ds-icon * {
    animation: none !important;
    transition: none !important;
  }
}
`;

/** Matches an enabled control that is hovered or keyboard focused. */
export const svgIconHoverSelector =
  ':is(button, a[href], [role="button"]):is(:hover, :focus-visible):not(:disabled, [aria-disabled="true"])';
