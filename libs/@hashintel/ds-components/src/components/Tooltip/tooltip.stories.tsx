import type { Story, StoryDefault } from "@ladle/react";

import { Button } from "../Button/button";
import { Icon } from "../Icon/icon";
import { Tooltip } from "./tooltip";

export default {
  title: "Components/Tooltip",
} satisfies StoryDefault;

const richContent = (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <strong>Rich tooltip</strong>
    <span>
      This tooltip contains structured content with multiple elements.
    </span>
  </div>
);

const variants = ["light", "dark"] as const;

export const Default: Story = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
    {variants.map((variant) => (
      <div key={variant}>
        <h3 style={{ marginBottom: 12 }}>
          {variant.charAt(0).toUpperCase() + variant.slice(1)} variant
        </h3>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Tooltip content="Button tooltip" variant={variant}>
            <Button variant="secondary" colorScheme="neutral" size="sm">
              Hover me
            </Button>
          </Tooltip>

          <Tooltip content="More information" variant={variant}>
            <Icon name="info" />
          </Tooltip>

          <Tooltip content={richContent} variant={variant}>
            Rich content
          </Tooltip>
        </div>
      </div>
    ))}
  </div>
);
Default.parameters = {
  controls: { disable: true },
};

const positions = [
  "top-start",
  "top",
  "top-end",
  "left-start",
  "empty",
  "right-start",
  "left",
  "empty",
  "right",
  "left-end",
  "empty",
  "right-end",
  "bottom-start",
  "bottom",
  "bottom-end",
] as const;

export const AllPositions: Story = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 12,
      padding: 80,
      maxWidth: 500,
      margin: "0 auto",
    }}
  >
    {positions.map((position) =>
      position === "empty" ? (
        // eslint-disable-next-line react/jsx-key
        <div />
      ) : (
        <Tooltip key={position} content={position} position={position}>
          <Button
            variant="secondary"
            colorScheme="neutral"
            size="lg"
            style={{ width: "100%" }}
          >
            {position}
          </Button>
        </Tooltip>
      ),
    )}
  </div>
);
AllPositions.parameters = {
  controls: { disable: true },
};
