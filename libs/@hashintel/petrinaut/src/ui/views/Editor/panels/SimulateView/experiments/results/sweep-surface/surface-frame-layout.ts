/** The heights that keep the sweep's surface card level with its neighbours, and its caption. */

/** The plot's height in pixels inside a surface card. */
export const SURFACE_PLOT_HEIGHT = 280;
/** The footer's content height for one row of controls: an extra-small Select. */
const SURFACE_FOOTER_HEIGHT = 24;
/** The footer's content height for two rows of controls and the gap between them. */
export const SURFACE_FOOTER_TWO_ROW_HEIGHT = SURFACE_FOOTER_HEIGHT * 2 + 6;

/** The caption: the axis readouts under the pointer mid-drag, the state line otherwise. */
export const surfaceCaption = ({
  preview,
  text,
}: {
  /** Axis readouts under the pointer mid-drag; null outside a drag. */
  preview: { x: string; y: string } | null;
  /** The state line shown outside a drag. */
  text: string;
}): string =>
  preview ? `${preview.x} · ${preview.y} — release to navigate` : text;
