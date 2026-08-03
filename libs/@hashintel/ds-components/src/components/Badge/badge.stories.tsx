import { css } from "@hashintel/ds-helpers/css";

import { Icon } from "../Icon/icon";
import { Badge, type BadgeProps } from "./badge";

import type { ChipColor } from "../Chip/chip";
import type { Story, StoryDefault } from "@ladle/react";

const colors: ChipColor[] = [
  "grey",
  "red",
  "blue",
  "green",
  "orange",
  "yellow",
  "purple",
  "pink",
];

const variants: NonNullable<BadgeProps["variant"]>[] = ["fill", "outline"];

const shapes: NonNullable<BadgeProps["shape"]>[] = ["default", "round"];

const positions: NonNullable<BadgeProps["position"]>[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

const noop = () => undefined;

const row = css({
  display: "flex",
  gap: "[20px]",
  alignItems: "center",
  flexWrap: "wrap",
});

const column = css({
  display: "flex",
  flexDirection: "column",
  gap: "[20px]",
});

const rowLabel = css({
  width: "[90px]",
  flexShrink: "0",
  textStyle: "sm",
  color: "fg.muted",
});

const bell = css({ color: "fg.muted" });

/** The bell icon the badge attaches to in these examples. */
const Bell = () => <Icon name="bell" size="lg" className={bell} />;

export default {
  title: "Components/Badge",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    color: { control: { type: "select", options: colors } },
    variant: { control: { type: "select", options: variants } },
    shape: { control: { type: "select", options: shapes } },
    position: { control: { type: "select", options: positions } },
    content: { control: { type: "text" } },
  },
  args: {
    content: "9",
    color: "red",
    variant: "fill",
    shape: "round",
    position: "top-right",
  },
} satisfies StoryDefault<BadgeProps>;

// Every colour, in both variants, attached to a bell.
export const Default: Story<BadgeProps> = (args) => (
  <div className={column}>
    {variants.map((variant) => (
      <div className={row} key={variant}>
        <div className={rowLabel}>{variant}</div>
        {colors.map((color) => (
          <Badge
            key={color}
            content={9}
            color={color}
            variant={variant}
            shape={args.shape}
          >
            <Bell />
          </Badge>
        ))}
      </div>
    ))}
  </div>
);

export const Shape: Story<BadgeProps> = (args) => (
  <div className={row}>
    {shapes.map((shape) => (
      <Badge
        key={shape}
        content={9}
        shape={shape}
        color={args.color}
        variant={args.variant}
      >
        <Bell />
      </Badge>
    ))}
  </div>
);
Shape.parameters = { controls: { exclude: ["shape", "content"] } };

// Each corner, so the overhang offsets can be checked.
export const Position: Story<BadgeProps> = (args) => (
  <div className={row}>
    {positions.map((position) => (
      <Badge
        key={position}
        content={9}
        position={position}
        color={args.color}
        variant={args.variant}
        shape={args.shape}
      >
        <Bell />
      </Badge>
    ))}
  </div>
);
Position.parameters = { controls: { exclude: ["position", "content"] } };

// `max` caps numeric content (99 → "99", 100/1000 → "99+"). A string is shown
// verbatim, and omitting `content` renders a plain dot.
export const Content: Story<BadgeProps> = (args) => (
  <div className={row}>
    {[9, 99, 100, 1000].map((count) => (
      <Badge
        key={count}
        content={count}
        max={99}
        color={args.color}
        variant={args.variant}
        shape={args.shape}
      >
        <Bell />
      </Badge>
    ))}
    <Badge content="new" color={args.color} variant={args.variant}>
      <Bell />
    </Badge>
    <Badge color={args.color} variant={args.variant}>
      <Bell />
    </Badge>
  </div>
);
Content.parameters = { controls: { exclude: ["content"] } };

// A clickable badge renders as a button with hover and focus-ring states.
export const Clickable: Story<BadgeProps> = (args) => (
  <div className={row}>
    <Badge
      content={9}
      onClick={noop}
      color={args.color}
      variant={args.variant}
      shape={args.shape}
    >
      <Bell />
    </Badge>
    <Badge
      onClick={noop}
      color={args.color}
      variant={args.variant}
      shape={args.shape}
    >
      <Bell />
    </Badge>
  </div>
);
Clickable.parameters = { controls: { exclude: ["content"] } };
