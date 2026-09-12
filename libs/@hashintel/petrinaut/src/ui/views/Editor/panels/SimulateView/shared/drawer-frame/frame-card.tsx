/**
 * A titled card spanning the frame body above the columns, in the chart
 * card's chrome: the title, a one-line subtitle and an optional help tooltip
 * on the left of the header, whatever the adopter puts on its right (a state
 * line, a switch), and the card's controls in the body. A card with `more`
 * keeps that part folded away behind a footer button, mounted so its state
 * survives; opening it animates the card's height alone, and whatever
 * follows the card moves as one block.
 */
import { use, useState, type ReactNode } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ChartCard, type ChartCardTone } from "../chart-card";
import { FrameAnimateContext } from "./frame-animate-context";

/** The footer's content height in pixels: an extra-small button. */
const FOOTER_HEIGHT = 24;

// The card is a direct child of the body's flex column: without this it
// would give its height up to the cards below once the body overflows.
const rootStyle = css({
  flexShrink: "0",
});

// The fold: a one-row grid whose row goes from `0fr` to `1fr`, so the
// content's own height is what animates and the content stays mounted. The
// content turns visible at once when opening and only after the row has
// closed when folding.
const foldStyle = css({
  display: "grid",
  gridTemplateRows: "[0fr]",
  visibility: "hidden",
  "&[data-expanded=true]": {
    gridTemplateRows: "[1fr]",
    visibility: "visible",
  },
  "&[data-animate=true]": {
    transition: "[grid-template-rows 160ms ease-out, visibility 0s 160ms]",
  },
  "&[data-animate=true][data-expanded=true]": {
    transition: "[grid-template-rows 160ms ease-out, visibility 0s]",
  },
});

const foldContentStyle = css({
  minHeight: "[0]",
  minWidth: "[0]",
  overflow: "hidden",
});

const foldInnerStyle = css({
  marginTop: "3",
  paddingTop: "3",
  borderTopWidth: "[1px]",
  borderTopStyle: "solid",
  borderTopColor: "neutral.bd.subtle",
});

/** A part of the card folded away by default and opened from the footer. */
export type FrameCardMore = {
  /** The footer button's label while the part is folded: `Show 3 fixed parameters`. */
  show: string;
  /** The label while the part is open: `Hide fixed parameters`. */
  hide: string;
  content: ReactNode;
};

export const FrameCard = ({
  title,
  subtitle,
  help,
  trailing,
  more = null,
  tone,
  children,
}: {
  title: string;
  /** One line under the title: what the card holds, e.g. `2 optimized · 3 fixed`. */
  subtitle?: string;
  help?: string;
  /** The header's right side: a state line, a switch. */
  trailing?: ReactNode;
  /** A part folded away by default and opened from the footer; it stays mounted. */
  more?: FrameCardMore | null;
  /** The card's look: `optimizing` while an optimizer drives its controls. */
  tone?: ChartCardTone;
  children: ReactNode;
}) => {
  const animate = use(FrameAnimateContext);
  const [expanded, setExpanded] = useState(false);
  const moreId = `frame-card-${title.replace(/\s+/gu, "-").toLowerCase()}-more`;

  return (
    <ChartCard
      className={rootStyle}
      title={title}
      subtitle={subtitle}
      help={help}
      actions={trailing}
      tone={tone}
      footer={
        more === null ? undefined : (
          <Button
            variant="ghost"
            size="xs"
            iconName={expanded ? "chevronUp" : "chevronDown"}
            iconPosition="right"
            aria-expanded={expanded}
            aria-controls={moreId}
            onClick={() => setExpanded((previous) => !previous)}
          >
            {expanded ? more.hide : more.show}
          </Button>
        )
      }
      footerHeight={more === null ? undefined : FOOTER_HEIGHT}
    >
      {children}
      {more === null ? null : (
        <div
          className={foldStyle}
          data-expanded={expanded}
          data-animate={animate}
        >
          <div
            id={moreId}
            className={foldContentStyle}
            data-frame-card-more
            inert={!expanded}
            aria-hidden={expanded ? undefined : true}
          >
            <div className={foldInnerStyle}>{more.content}</div>
          </div>
        </div>
      )}
    </ChartCard>
  );
};
