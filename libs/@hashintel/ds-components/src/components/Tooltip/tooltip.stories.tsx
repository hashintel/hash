import { css } from "@hashintel/ds-helpers/css";

import { Button } from "../Button/button";
import { Icon } from "../Icon/icon";
import { Tooltip } from "./tooltip";

import type { Story, StoryDefault } from "@ladle/react";

type TooltipProps = React.ComponentProps<typeof Tooltip>;

const tooltipVariants = [
  "light",
  "dark",
] as const satisfies readonly NonNullable<TooltipProps["variant"]>[];

const allPositions = [
  "top-start",
  "top",
  "top-end",
  "right-start",
  "right",
  "right-end",
  "bottom-start",
  "bottom",
  "bottom-end",
  "left-start",
  "left",
  "left-end",
] as const satisfies readonly NonNullable<TooltipProps["position"]>[];

const delays = [
  "none",
  "fast",
  "medium",
  "slow",
] as const satisfies readonly NonNullable<TooltipProps["openDelay"]>[];

const richContent = (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <strong>Rich tooltip</strong>
    <span>
      This tooltip contains structured content with multiple elements.
    </span>
  </div>
);

export default {
  title: "Components/Tooltip",
  argTypes: {
    variant: {
      control: { type: "radio" },
      options: tooltipVariants,
      description: "Visual variant",
    },
    position: {
      control: { type: "select" },
      options: allPositions,
      description: "Preferred tooltip position",
    },
    disableTooltip: {
      control: { type: "boolean" },
      description: "Disable the tooltip from opening",
    },
    openDelay: {
      control: { type: "select" },
      options: delays,
      description: "Delay before the tooltip opens",
    },
    closeDelay: {
      control: { type: "select" },
      options: delays,
      description: "Delay before the tooltip closes",
    },
  },
  args: {
    variant: "dark",
    position: "bottom",
    disableTooltip: false,
    openDelay: "medium",
    closeDelay: "medium",
  },
} satisfies StoryDefault<TooltipProps>;

const noop = () => {};

export const Default: Story<TooltipProps> = (args) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
    {tooltipVariants.map((variant) => (
      <div key={variant}>
        <h3 style={{ marginBottom: 12 }}>
          {variant.charAt(0).toUpperCase() + variant.slice(1)} variant
        </h3>
        <div className={css({ "& > *": { marginX: "3" } })}>
          <Tooltip {...args} content="Button tooltip" variant={variant}>
            <Button size="sm" onClick={noop}>
              Hover me
            </Button>
          </Tooltip>

          <Tooltip {...args} content="More information" variant={variant}>
            <Icon name="info" />
          </Tooltip>

          <Tooltip {...args} content={richContent} variant={variant}>
            Rich content
          </Tooltip>
        </div>
      </div>
    ))}
  </div>
);

const gridPositions = [
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

export const AllPositions: Story<TooltipProps> = (args) => (
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
    {gridPositions.map((position, index) =>
      position === "empty" ? (
        // eslint-disable-next-line react/no-array-index-key
        <div key={`empty-${index}`} />
      ) : (
        <Tooltip
          {...args}
          key={position}
          content={position}
          position={position}
        >
          <Button size="xxs" className={css({ width: "[100%]" })} onClick={noop}>
            {position}
          </Button>
        </Tooltip>
      ),
    )}
  </div>
);
