/** The sizes a chart card and its grid are laid out with, in pixels. */

/** The header's height in pixels: its padding, the title line, the subtitle line and its hairline. */
const CHART_CARD_HEADER_HEIGHT = 53;
/** The body's padding on each side, in pixels (the `4` spacing token). */
const CHART_CARD_BODY_PADDING = 16;
/** The footer's vertical padding on each side plus its hairline, in pixels. */
const CHART_CARD_FOOTER_CHROME = 17;
/** The card's top and bottom border, in pixels. */
const CHART_CARD_BORDER = 2;

/**
 * The height a card takes with these body and footer heights, so a grid's
 * `rowHeight` and its cards' `bodyHeight` are never computed apart.
 */
export const chartCardHeight = ({
  bodyHeight,
  footerHeight = 0,
}: {
  bodyHeight: number;
  footerHeight?: number;
}): number =>
  CHART_CARD_BORDER +
  CHART_CARD_HEADER_HEIGHT +
  CHART_CARD_BODY_PADDING * 2 +
  bodyHeight +
  (footerHeight > 0 ? footerHeight + CHART_CARD_FOOTER_CHROME : 0);

/** The body height that makes a card exactly `cardHeight` tall; the inverse of `chartCardHeight` without a footer. */
export const chartCardBodyHeight = (cardHeight: number): number =>
  cardHeight -
  (CHART_CARD_BORDER + CHART_CARD_HEADER_HEIGHT + CHART_CARD_BODY_PADDING * 2);

/**
 * The narrowest a chart card gets in a grid, in pixels: two fit side by side
 * in the frame's secondary column from its minimum width up.
 */
export const CHART_CARD_MIN_WIDTH = 320;

/** The grid's gap between cards, in pixels (the `4` spacing token). */
export const CHART_CARD_GRID_GAP = 16;

/** The plot's height inside an experiment's metric cards; the smallest the axes and labels fit in. */
export const METRIC_PLOT_HEIGHT = 220;
