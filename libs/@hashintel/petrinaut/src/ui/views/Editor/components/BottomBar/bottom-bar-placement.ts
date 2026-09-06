/**
 * Where the bottom bar sits between the panels docked around the canvas, and
 * whether everything it can show fits there.
 *
 * The bar is centered on the canvas rather than on the space left between the
 * panels: opening a panel must not move a bar that still has room. A bar that
 * would run under a panel is pushed aside, and only as far as it takes to
 * clear it.
 */

/** The space the bar has to sit in, in CSS pixels. */
export interface BottomBarBounds {
  /** Width of the canvas area the bar is centered on. */
  readonly containerWidth: number;
  /** Width taken by whatever is docked on the left. */
  readonly leftInset: number;
  /** Width taken by whatever is docked on the right, viewport controls included. */
  readonly rightInset: number;
  /** Gap kept clear inside each inset, so the bar never touches a panel. */
  readonly margin: number;
}

/** Width left for the bar once the insets and both margins are taken out. */
const getAvailableWidth = (bounds: BottomBarBounds): number =>
  bounds.containerWidth -
  bounds.leftInset -
  bounds.rightInset -
  bounds.margin * 2;

/**
 * Whether a bar of `width` clears both insets while it stays centered, or can
 * be pushed aside far enough to. An unmeasured container imposes no limit, so
 * the bar shows everything until it has been measured.
 */
export const fitsWithinBounds = (
  bounds: BottomBarBounds,
  width: number,
): boolean => bounds.containerWidth <= 0 || width <= getAvailableWidth(bounds);

/**
 * How far to shift a bar of `barWidth` from the centered position for it to
 * clear both insets: positive to the right, negative to the left, zero while
 * the centered bar already clears them. A bar wider than the space between the
 * insets cannot clear both, and keeps its left edge.
 */
export const getBottomBarOffset = (
  bounds: BottomBarBounds,
  barWidth: number,
): number => {
  if (bounds.containerWidth <= 0 || barWidth <= 0) {
    return 0;
  }

  const centeredLeft = (bounds.containerWidth - barWidth) / 2;
  const leftLimit = bounds.leftInset + bounds.margin;
  const rightLimit =
    bounds.containerWidth - bounds.rightInset - bounds.margin - barWidth;

  // `Math.max` last so the left limit wins when the two cross, which is what
  // happens once the bar is wider than the space between the insets.
  return Math.max(leftLimit, Math.min(centeredLeft, rightLimit)) - centeredLeft;
};
