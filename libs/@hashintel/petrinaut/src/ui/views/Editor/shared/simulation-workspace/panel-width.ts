/** The widths the Simulate panel may have in a workspace, and the one it has, in pixels. */
export interface SimulationPanelWidth {
  minWidth: number;
  maxWidth: number;
  width: number;
}

/**
 * How wide the Simulate panel is in a workspace of `workspaceWidth`.
 *
 * `preferredWidth` is the width the user chose, or `null` before any choice:
 * the panel then takes three fifths of the workspace, up to 960 pixels. The
 * list beside the panel keeps 280 pixels or two fifths of the workspace,
 * whichever is less, and the panel is no narrower than 440 pixels where that
 * leaves room.
 */
export const simulationPanelWidth = (
  workspaceWidth: number,
  preferredWidth: number | null,
): SimulationPanelWidth => {
  const maxWidth = Math.max(
    0,
    workspaceWidth - Math.min(280, workspaceWidth * 0.4),
  );
  const minWidth = Math.min(440, maxWidth);
  const width = Math.max(
    minWidth,
    Math.min(maxWidth, preferredWidth ?? Math.min(960, workspaceWidth * 0.6)),
  );

  return { minWidth, maxWidth, width };
};
