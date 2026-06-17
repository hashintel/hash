import { loremIpsum } from "lorem-ipsum";
import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { Button } from "../Button/button";
import { ScrollHint } from "./scroll-hint";

import type { Story } from "@ladle/react";

export default {
  title: "Components/ScrollHint",
};

/** A fixed-size, bordered viewport so the scroll cues are visible. */
const viewportStyle = css({
  height: "[180px]",
  width: "[320px]",
  border: "[1px solid #d4d4d4]",
  borderRadius: "[8px]",
  padding: "3",
});

const exampleStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const galleryStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "6",
  alignItems: "flex-start",
});

const columnStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
});

const rowStyle = css({
  display: "flex",
  gap: "3",
  width: "[max-content]",
});

const cardStyle = css({
  width: "[160px]",
  flex: "[0 0 auto]",
  padding: "3",
  borderRadius: "[6px]",
  backgroundColor: "[#f1f1f1]",
});

const blockStyle = css({
  width: "[640px]",
  height: "[480px]",
  padding: "3",
  borderRadius: "[6px]",
  backgroundColor: "[#f1f1f1]",
});

const labelStyle = css({
  textStyle: "sm",
  fontWeight: "medium",
});

const sentences = (count: number): string =>
  loremIpsum({ count, units: "sentences" });

/** Several distinct paragraphs, tall enough to need vertical scrolling. */
const tallParagraphs = [
  sentences(3),
  sentences(4),
  sentences(3),
  sentences(5),
  sentences(4),
];

/** Distinct cards, wide enough to need horizontal scrolling. */
const wideCards = [
  "Alpha",
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
];

const VerticalContent = () => (
  <div className={columnStyle}>
    {tallParagraphs.map((text) => (
      <p key={text}>{text}</p>
    ))}
  </div>
);

const HorizontalContent = () => (
  <div className={rowStyle}>
    {wideCards.map((card) => (
      <div key={card} className={cardStyle}>
        {card}
      </div>
    ))}
  </div>
);

const BothContent = () => (
  <div className={blockStyle}>
    This content is both wider and taller than its container, so it scrolls on
    both axes.
  </div>
);

const Example = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className={exampleStyle}>
    <span className={labelStyle}>{label}</span>
    {children}
  </div>
);

export const Default: Story = () => (
  <div className={galleryStyle}>
    <Example label="Vertical">
      <ScrollHint vertical className={viewportStyle}>
        <VerticalContent />
      </ScrollHint>
    </Example>

    <Example label="Horizontal">
      <ScrollHint horizontal className={viewportStyle}>
        <HorizontalContent />
      </ScrollHint>
    </Example>

    <Example label="Both">
      <ScrollHint vertical horizontal className={viewportStyle}>
        <BothContent />
      </ScrollHint>
    </Example>

    <Example label="Colored background">
      <div className={css({ backgroundColor: "[black]", color: "[white]" })}>
        <ScrollHint vertical className={viewportStyle}>
          <VerticalContent />
        </ScrollHint>
      </div>
    </Example>

    <Example label="Both (content fits, no scroll)">
      <ScrollHint vertical horizontal className={viewportStyle}>
        <p>
          Short content that fits within the viewport, so no scrollbars or cues
          appear.
        </p>
      </ScrollHint>
    </Example>
  </div>
);

/**
 * A button that reveals longer content on click, toggling the scroll hint between
 * non-scrollable and scrollable. With `stableScrollGutter` the internal size of
 * the content does not jump as the scrollbar appears and disappears.
 */
const ToggleExample = ({
  label,
  vertical,
  horizontal,
  children,
}: {
  label: string;
  vertical?: boolean;
  horizontal?: boolean;
  children: React.ReactNode;
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Example label={label}>
      <ScrollHint
        vertical={vertical}
        horizontal={horizontal}
        stableScrollGutter
        className={viewportStyle}
      >
        <div
          className={
            horizontal && !vertical
              ? css({ display: "flex", gap: "3", alignItems: "flex-start" })
              : columnStyle
          }
        >
          <Button
            size="sm"
            onClick={() => setExpanded((value) => !value)}
            className={css({ flex: "[0 0 auto]" })}
          >
            {expanded ? "Show less" : "Show more"}
          </Button>
          {expanded ? children : null}
        </div>
      </ScrollHint>
    </Example>
  );
};

export const StableScrollGutter: Story = () => (
  <div className={galleryStyle}>
    <ToggleExample label="Vertical" vertical>
      <VerticalContent />
    </ToggleExample>

    <ToggleExample label="Horizontal" horizontal>
      <HorizontalContent />
    </ToggleExample>

    <ToggleExample label="Both" vertical horizontal>
      <BothContent />
    </ToggleExample>
  </div>
);
