import { css } from "@hashintel/ds-helpers/css";

import { Button } from "../Button/button";
import { Icon } from "../Icon/icon";
import { BaseTooltip } from "./base-tooltip";
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

const kbdKeyStyles = css({
  paddingX: "1",
  paddingY: "0.5",
  borderRadius: "sm",
  backgroundColor: "neutral.s10",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.s30",
  color: "fg.body",
  fontFamily: "[inherit]",
});

// BaseTooltip is unstyled: `content` is rendered via `asChild`, so it must be a
// single element that carries its own styling. This shows a fully custom overlay
// that the standard light/dark Tooltip variants can't produce.
const customTooltipContent = (
  <div
    className={css({
      display: "flex",
      flexDirection: "column",
      gap: "2",
      width: "[260px]",
      padding: "3",
      borderRadius: "lg",
      backgroundColor: "white",
      borderWidth: "[1px]",
      borderStyle: "solid",
      borderColor: "neutral.s30",
      boxShadow: "[0 8px 24px rgba(0, 0, 0, 0.16)]",
    })}
  >
    <div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
      <span
        className={css({
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "[24px]",
          height: "[24px]",
          borderRadius: "md",
          backgroundColor: "blue.s85",
          color: "white",
        })}
      >
        <Icon name="sparkles" size="sm" />
      </span>
      <strong className={css({ textStyle: "sm", color: "fg.heading" })}>
        Custom tooltip UI
      </strong>
    </div>
    <span className={css({ textStyle: "xs", color: "fg.muted" })}>
      BaseTooltip is unstyled, so you can render any layout you like — icons,
      headings, and keyboard hints included.
    </span>
    <div
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "1",
        textStyle: "xs",
        color: "fg.subtle",
      })}
    >
      <span>Press</span>
      <kbd className={kbdKeyStyles}>⌘</kbd>
      <kbd className={kbdKeyStyles}>K</kbd>
      <span>to learn more</span>
    </div>
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

    <div>
      <h3 style={{ marginBottom: 12 }}>Custom UI (BaseTooltip)</h3>
      <div className={css({ "& > *": { marginX: "3" } })}>
        <BaseTooltip
          position={args.position}
          disableTooltip={args.disableTooltip}
          openDelay={args.openDelay}
          closeDelay={args.closeDelay}
          content={customTooltipContent}
        >
          <Button size="sm" onClick={noop}>
            Hover for custom tooltip
          </Button>
        </BaseTooltip>
      </div>
    </div>
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
          <Button
            size="xxs"
            className={css({ width: "[100%]" })}
            onClick={noop}
          >
            {position}
          </Button>
        </Tooltip>
      ),
    )}
  </div>
);
