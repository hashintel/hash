import { css } from "@hashintel/ds-helpers/css";

import { InlineHighlight, type InlineHighlightColor } from "./inline-highlight";

import type { Meta, StoryObj } from "@storybook/react-vite";

const sections = css({
  display: "flex",
  flexDirection: "column",
  gap: "[24px]",
  maxWidth: "[560px]",
});

const caption = css({
  fontSize: "[12px]",
  color: "[#71717a]",
  marginBottom: "[4px]",
});

// Drag-resizable via the bottom-right handle to watch the outline re-wrap.
const box = css({
  border: "[1px solid #d4d4d8]",
  borderRadius: "[6px]",
  padding: "[12px]",
  resize: "horizontal",
  overflow: "hidden",
  minWidth: "[120px]",
  fontSize: "[14px]",
  lineHeight: "[1.5]",
});

const colors: InlineHighlightColor[] = [
  "grey",
  "red",
  "blue",
  "green",
  "orange",
  "yellow",
  "purple",
  "pink",
];

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

// Overrides set the vars the component reads — on an ancestor or on the
// element's own className, never by redeclaring its styled properties.
const roomyPadding = css({
  "--inline-highlight-padding-inline": "[0.7em]",
  "--inline-highlight-padding-block": "[0.3em]",
});

const customColors = css({
  "--inline-highlight-bg": "[#ede9fe]",
  "--inline-highlight-ring-color": "[#7c3aed]",
});

export const Default: Story = {
  render: () => (
    <div className={sections}>
      <Example label="wrapping (defined)" width={260}>
        Entities link to{" "}
        <InlineHighlight color="blue">
          the type system that defines their properties and relationships
        </InlineHighlight>{" "}
        across the graph.
      </Example>
      <Example label="wrapping (soft)" width={260}>
        Entities link to{" "}
        <InlineHighlight color="blue" variant="soft">
          the type system that defines their properties and relationships
        </InlineHighlight>{" "}
        across the graph.
      </Example>
      <Example label="single line" width={420}>
        A short <InlineHighlight>inline run</InlineHighlight> that fits on one
        line keeps a plain rounded box.
      </Example>
      <Example label="padding vars set on an ancestor" width={260}>
        <div className={roomyPadding}>
          Entities link to{" "}
          <InlineHighlight color="green">
            the type system that defines their properties and relationships
          </InlineHighlight>{" "}
          across the graph.
        </div>
      </Example>
    </div>
  ),
};

export const Colors: Story = {
  render: () => (
    <div className={sections}>
      {(["defined", "soft"] as const).map((variant) => (
        <Example key={variant} label={variant} width={300}>
          {colors.map((color) => (
            <span key={color}>
              <InlineHighlight color={color} variant={variant}>
                some {color} text that wraps around
              </InlineHighlight>{" "}
            </span>
          ))}
        </Example>
      ))}
      <Example label="custom border + background via className" width={300}>
        Overrides go in a class:{" "}
        <InlineHighlight className={customColors}>
          a violet highlight the palettes don't offer, wrapping across lines
        </InlineHighlight>{" "}
        with the fill and ring colours on their CSS variables.
      </Example>
    </div>
  ),
};

const meta = {
  title: "Primitives/InlineHighlight",
  component: InlineHighlight,
} satisfies Meta;

export default meta;

type Story = StoryObj;
