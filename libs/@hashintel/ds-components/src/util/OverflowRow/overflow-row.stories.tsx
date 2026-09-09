import { css } from "@hashintel/ds-helpers/css";

import { Chip } from "../../components/Chip/chip";
import { OverflowRow } from "./overflow-row";

import type { Story, StoryDefault } from "@ladle/react";

const names = [
  "Draft",
  "In review",
  "Published",
  "Archived",
  "Deleted",
  "Scheduled",
];

const allItems = names.map((name) => ({
  name,
  children: (
    <Chip color="blue" variant="soft">
      {name}
    </Chip>
  ),
}));

const sections = css({
  display: "flex",
  flexDirection: "column",
  gap: "[24px]",
});

const heading = css({
  fontSize: "[13px]",
  fontWeight: "[600]",
  color: "[#3f3f46]",
  marginBottom: "[8px]",
});

const row = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "[16px]",
  alignItems: "flex-start",
});

const caption = css({
  fontSize: "[12px]",
  color: "[#71717a]",
  marginBottom: "[4px]",
});

// Every example box is drag-resizable via its bottom-right handle.
const box = css({
  border: "[1px solid #d4d4d8]",
  borderRadius: "[6px]",
  padding: "[8px]",
  resize: "horizontal",
  overflow: "hidden",
  minWidth: "[24px]",
});

// Match the "+X" label to the chips: the chip-label font size, with the line
// box pinned to the chip cells' rendered height (the 20px chip sits on the
// text baseline, adding ~2px of descender room) so the row is as tall with
// the label (even alone) as with chips.
const chipMatchedLabel = css({
  fontSize: "[12px]",
  lineHeight: "[22px]",
});

const Example = ({
  label,
  width,
  children,
}: {
  label: string;
  width: number;
  children: React.ReactNode;
}) => (
  <div>
    <div className={caption}>{label}</div>
    <div className={box} style={{ width }}>
      {children}
    </div>
  </div>
);

// Approximate widths: enough room for no whole item, one, two, and all six.
const rowExamples = [
  { label: "< 1 item", width: 40 },
  { label: "1 item", width: 100 },
  { label: "2 items", width: 180 },
  { label: "all 6 items", width: 520 },
];

const summaryExamples = [
  { label: "0 items", items: [], width: 100 },
  { label: "1 item (fit)", items: allItems.slice(0, 1), width: 120 },
  { label: "1 item (not fit)", items: allItems.slice(1, 2), width: 64 },
  { label: "2 items (fit)", items: allItems.slice(0, 2), width: 160 },
  { label: "2 items (not fit)", items: allItems.slice(0, 2), width: 70 },
  { label: "all items", items: allItems, width: 100 },
  { label: "ellipsified", items: allItems.slice(0, 2), width: 40 },
];

const countLabelRenderers = [
  { label: "text (default)", truncate: undefined, summary: undefined },
  {
    label: "custom",
    truncate: (text: string) => (
      <Chip color="blue" variant="soft">
        {text}
      </Chip>
    ),
    summary: (text: string) => <em>{text}</em>,
  },
];

export const Default: Story = () => (
  <div className={sections}>
    {(["truncate", "scroll"] as const).map((overflow) => (
      <div key={overflow}>
        <div className={heading}>{overflow}</div>
        <div className={row}>
          {rowExamples.map(({ label, width }) => (
            <Example key={label} label={label} width={width}>
              <OverflowRow
                items={allItems}
                overflow={overflow}
                className={
                  overflow === "truncate" ? chipMatchedLabel : undefined
                }
              />
            </Example>
          ))}
        </div>
      </div>
    ))}
    <div>
      <div className={heading}>summary</div>
      <div className={row}>
        {summaryExamples.map(({ label, items, width }) => (
          <Example key={label} label={label} width={width}>
            <OverflowRow
              items={items}
              overflow="summary"
              total={6}
              separator=", "
            />
          </Example>
        ))}
      </div>
    </div>
    {/* scroll never renders an overflow label, and rejects the prop. */}
    <div>
      <div className={heading}>renderCountLabel</div>
      <div className={row}>
        {countLabelRenderers.map(({ label, truncate }) => (
          <Example
            key={`truncate-${label}`}
            label={`truncate — ${label}`}
            width={180}
          >
            <OverflowRow
              items={allItems}
              overflow="truncate"
              renderCountLabel={truncate}
              className={chipMatchedLabel}
            />
          </Example>
        ))}
        {countLabelRenderers.map(({ label, summary }) => (
          <Example
            key={`summary-${label}`}
            label={`summary — ${label}`}
            width={70}
          >
            <OverflowRow
              items={allItems.slice(0, 2)}
              overflow="summary"
              total={6}
              renderCountLabel={summary}
            />
          </Example>
        ))}
      </div>
    </div>
  </div>
);

export default {
  title: "Primitives/OverflowRow",
} satisfies StoryDefault;
