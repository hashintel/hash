/**
 * The one chrome every sub-part of the Simulate views sits in: a bordered
 * card with a header row (title and subtitle left, actions right), a clipped
 * body of fixed height, and an optional footer row. Cards in a `ChartCardGrid`
 * share one row height, so a card's content can change what it draws without
 * moving its neighbours.
 */
import { Button, HelpTooltip, Menu } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type { ComponentProps, ReactNode } from "react";

/**
 * How a card reads its state. `paused` is a frozen look, `muted` a
 * below-floor look, `optimizing` the purple glow of controls an optimizer
 * drives.
 */
export type ChartCardTone = "default" | "paused" | "muted" | "optimizing";

/** The header's height in pixels: its padding, the title line, the subtitle line and its hairline. */
export const CHART_CARD_HEADER_HEIGHT = 53;
/** The body's padding on each side, in pixels (the `4` spacing token). */
export const CHART_CARD_BODY_PADDING = 16;
/** The footer's vertical padding on each side plus its hairline, in pixels. */
export const CHART_CARD_FOOTER_CHROME = 17;
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

// The card clips its content, with a margin so the halo it draws while an
// optimizer drives it shows. The halo is a pseudo-element carrying the peak
// shadow whose opacity breathes: the compositor runs that, not the painter.
// It breathes only under the frame's animate switch, which the body stamps.
const rootStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  minWidth: "[0]",
  minHeight: "[0]",
  overflow: "clip",
  overflowClipMargin: "[24px]",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "xl",
  backgroundColor: "neutral.s00",
  transition:
    "[border-color 200ms ease, box-shadow 200ms ease, background-color 200ms ease]",
  "&[data-tone=paused]": { borderColor: "neutral.s60" },
  "&[data-tone=optimizing]": {
    borderColor: "purple.s80",
    backgroundColor: "purple.s10",
    boxShadow:
      "[0 0 0 1px var(--colors-purple-a30), 0 0 12px var(--colors-purple-a30)]",
  },
  "&[data-tone=optimizing]::after": {
    content: '""',
    position: "absolute",
    inset: "[0]",
    borderRadius: "[inherit]",
    pointerEvents: "none",
    boxShadow:
      "[0 0 0 1px var(--colors-purple-a50), 0 0 22px var(--colors-purple-a40)]",
    opacity: "[0]",
    "[data-animate=true] &": {
      animationName: "[petrinautOptimizingGlow]",
      animationDuration: "[2.4s]",
      animationTimingFunction: "ease-in-out",
      animationIterationCount: "[infinite]",
    },
  },
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  flexShrink: "0",
  paddingX: "4",
  paddingY: "2",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
  "[data-tone=optimizing] > &": { borderBottomColor: "purple.s40" },
});

const headingStyle = css({
  display: "flex",
  flexDirection: "column",
  minWidth: "[0]",
});

const titleRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  minWidth: "[0]",
  height: "[20px]",
});

const titleStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[20px]",
  color: "neutral.s120",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  "[data-tone=paused] &": { color: "neutral.s90" },
  "[data-tone=optimizing] &": { color: "purple.s115" },
});

const subtitleStyle = css({
  fontSize: "xs",
  lineHeight: "[16px]",
  height: "[16px]",
  color: "neutral.s80",
  "[data-tone=optimizing] &": { color: "purple.s100" },
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

// The right side yields before the heading does: a state line in it
// ellipsizes, while a menu button is never narrower than itself.
const actionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  minWidth: "[0]",
});

const bodyStyle = css({
  position: "relative",
  minHeight: "[0]",
  padding: "4",
  overflow: "hidden",
  "[data-tone=muted] &": { opacity: "[0.6]" },
});

// A body without a fixed height takes what the card's layout leaves it.
const fillingBodyStyle = css({
  flex: "[1]",
});

// The fixed height is the content's, so the padding sits outside it.
const fixedBodyStyle = css({
  flexShrink: "0",
  boxSizing: "content-box",
});

const footerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  flexShrink: "0",
  paddingX: "4",
  paddingY: "2",
  borderTopWidth: "[1px]",
  borderTopStyle: "solid",
  borderTopColor: "neutral.bd.subtle",
  fontSize: "xs",
  color: "neutral.s80",
  boxSizing: "content-box",
});

export type ChartCardProps = {
  title: string;
  /**
   * One line under the title: what is drawn and from what. Its height is
   * reserved even when absent, so cards in one row align.
   */
  subtitle?: string;
  /** A help tooltip after the title. */
  help?: string;
  /** The header's right side: a `ChartCardMenu`, icon buttons, a chip. */
  actions?: ReactNode | null;
  /**
   * The body's fixed content height in pixels. The body clips; it never grows
   * or shrinks with its content. Omit only for a card whose height is the
   * layout's business (a table filling the drawer).
   */
  bodyHeight?: number;
  /** One row under the body: a legend, a caption, a picker. */
  footer?: ReactNode;
  /** The footer's content height in pixels; reserved even when `footer` is absent. */
  footerHeight?: number;
  tone?: ChartCardTone;
  className?: string;
  children: ReactNode;
};

export const ChartCard = ({
  title,
  subtitle,
  help,
  actions,
  bodyHeight,
  footer,
  footerHeight,
  tone = "default",
  className,
  children,
}: ChartCardProps) => (
  <div className={cx(rootStyle, className)} data-chart-card data-tone={tone}>
    <div className={headerStyle}>
      <div className={headingStyle}>
        <div className={titleRowStyle}>
          <span className={titleStyle}>{title}</span>
          {help === undefined ? null : (
            <HelpTooltip content={help} align="center" />
          )}
        </div>
        <span className={subtitleStyle} data-chart-card-subtitle>
          {subtitle}
        </span>
      </div>
      {actions == null ? null : <div className={actionsStyle}>{actions}</div>}
    </div>
    <div
      className={cx(
        bodyStyle,
        bodyHeight === undefined ? fillingBodyStyle : fixedBodyStyle,
      )}
      data-chart-card-body
      style={bodyHeight === undefined ? undefined : { height: bodyHeight }}
    >
      {children}
    </div>
    {footer === undefined && footerHeight === undefined ? null : (
      <div
        className={footerStyle}
        style={
          footerHeight === undefined ? undefined : { height: footerHeight }
        }
      >
        {footer}
      </div>
    )}
  </div>
);

export type ChartCardMenuProps = {
  /** The trigger's accessible name, e.g. "Chart options". */
  label: string;
  items: ComponentProps<typeof Menu>["items"];
};

/** The header's overflow menu: an ellipsis button opening a ds `Menu`. */
export const ChartCardMenu = ({ label, items }: ChartCardMenuProps) => (
  <Menu
    items={items}
    position="bottom-end"
    trigger={
      <Button
        iconName="ellipsis"
        variant="ghost"
        size="xs"
        aria-label={label}
        tooltip={label}
      />
    }
  />
);

/**
 * The narrowest a chart card gets in a grid, in pixels: two fit side by side
 * in the frame's secondary column from its minimum width up.
 */
export const CHART_CARD_MIN_WIDTH = 320;

/** The grid's gap between cards, in pixels (the `4` spacing token). */
export const CHART_CARD_GRID_GAP = 16;

// Dense packing fills the cells a spanning card leaves in its row with the
// cards after it instead of holes; with equal cards it places them in order.
// The cards stay in source order, so the Tab order is the grid's order
// before any card was enlarged.
const gridStyle = css({
  display: "grid",
  gridAutoFlow: "row dense",
  alignItems: "stretch",
  gap: "4",
});

export type ChartCardGridProps = {
  /** Columns are as many of at least this width, in pixels, as fit. */
  minColumnWidth: number;
  /** Every row is exactly this tall, in pixels. */
  rowHeight: number;
  children: ReactNode;
};

/**
 * A fixed grid of cards. Nothing in the grid moves when a card's content
 * changes; only the card count, or a card spanning cells, changes the grid.
 */
export const ChartCardGrid = ({
  minColumnWidth,
  rowHeight,
  children,
}: ChartCardGridProps) => (
  <div
    className={gridStyle}
    data-chart-card-grid
    style={{
      gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minColumnWidth}px), 1fr))`,
      gridAutoRows: `${rowHeight}px`,
    }}
  >
    {children}
  </div>
);
