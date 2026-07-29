import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { Chip, type ChipColor, type ChipProps } from "./chip";

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
  "black",
];

const variants: NonNullable<ChipProps["variant"]>[] = [
  "fill",
  "fillLight",
  "outline",
  "subtle",
];

const shapes: NonNullable<ChipProps["shape"]>[] = ["default", "round"];

type AffixVariant = "straight" | "circle" | "angle" | "naked";

// The affix `variant`s, plus an optional chip `shape` for the row.
const affixStyles: {
  label: string;
  variant?: AffixVariant;
  shape?: NonNullable<ChipProps["shape"]>;
}[] = [
  { label: "straight", variant: "straight" },
  { label: "naked", variant: "naked" },
  { label: "circle", variant: "circle" },
  { label: "circle (round)", variant: "circle", shape: "round" },
  { label: "angle", variant: "angle" },
];

const dotStyles = ["filled", "partiallyFilled", "empty"] as const;

const noop = () => undefined;

const row = css({
  display: "flex",
  gap: "[12px]",
  alignItems: "center",
  flexWrap: "wrap",
});

const column = css({
  display: "flex",
  flexDirection: "column",
  gap: "[16px]",
});

const rowLabel = css({
  width: "[110px]",
  flexShrink: "0",
  textStyle: "sm",
  color: "fg.muted",
});

/** The "kitchen sink" chip: a prefix icon, a whole-chip click, and removeable. */
const KitchenSinkChip = ({
  children,
  color,
  variant,
  size,
  shape,
  prefixVariant,
}: {
  children: React.ReactNode;
  color?: ChipColor;
  variant?: ChipProps["variant"];
  size?: ChipProps["size"];
  shape?: ChipProps["shape"];
  prefixVariant?: AffixVariant;
}) => (
  <Chip
    color={color}
    variant={variant}
    size={size}
    shape={shape}
    onClick={noop}
    prefix={{ iconName: "sparkles", variant: prefixVariant }}
    removeable={{ removeable: true, onRemove: noop }}
  >
    {children}
  </Chip>
);

export default {
  title: "Components/Chip",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    color: {
      control: { type: "select", options: colors },
    },
    variant: {
      control: { type: "select", options: variants },
    },
    size: {
      control: { type: "select", options: formInputSizes },
    },
    shape: {
      control: { type: "select", options: ["default", "round"] },
    },
    children: {
      control: { type: "text" },
    },
  },
  args: {
    children: "Chip",
    color: "grey",
    variant: "fill",
    size: "md",
    shape: "default",
  },
} satisfies StoryDefault<ChipProps>;

export const Default: Story<ChipProps> = (args) => (
  <div className={column}>
    {variants.map((variant) => (
      <div className={row} key={variant}>
        <div className={rowLabel}>{variant}</div>
        {colors.map((color) => (
          <KitchenSinkChip
            key={color}
            color={color}
            variant={variant}
            size={args.size}
          >
            {color}
          </KitchenSinkChip>
        ))}
      </div>
    ))}
  </div>
);

export const Shape: Story<ChipProps> = (args) => (
  <div className={column}>
    <div className={row}>
      {shapes.map((shape) => (
        <Chip {...args} key={shape} shape={shape}>
          {shape}
        </Chip>
      ))}
    </div>

    <div className={row}>
      {shapes.map((shape) => (
        <KitchenSinkChip
          key={shape}
          shape={shape}
          color={args.color}
          variant={args.variant}
          size={args.size}
        >
          {shape}
        </KitchenSinkChip>
      ))}
    </div>

    <div className={row}>
      {shapes.map((shape) => (
        <KitchenSinkChip
          key={shape}
          shape={shape}
          prefixVariant="circle"
          color={args.color}
          variant={args.variant}
          size={args.size}
        >
          {shape}
        </KitchenSinkChip>
      ))}
    </div>
  </div>
);
Shape.parameters = { controls: { exclude: ["shape", "children"] } };

export const Size: Story<ChipProps> = (args) => (
  <div className={row}>
    {formInputSizes.map((size) => (
      <KitchenSinkChip
        key={size}
        size={size}
        color={args.color}
        variant={args.variant}
      >
        {size}
      </KitchenSinkChip>
    ))}
  </div>
);
Size.parameters = { controls: { exclude: ["size", "children"] } };

export const PrefixAndSuffix: Story<ChipProps> = (args) => {
  // `suffix` and `removeable` are mutually exclusive, so drop them from the
  // spread base before setting a suffix on the chips below.
  const { suffix: _suffix, removeable: _removeable, ...base } = args;

  return (
    <div className={column}>
      <div className={row}>
        <div className={rowLabel}>no affix</div>
        <Chip {...base}>Static</Chip>
        <Chip {...base} onClick={noop}>
          Clickable
        </Chip>
      </div>

      {affixStyles.map((style) => {
        // An entry may pin the row's shape (e.g. circle on `round`); otherwise
        // follow the story's shape control.
        const shape = style.shape ?? base.shape;
        return (
          <div className={row} key={style.label}>
            <div className={rowLabel}>{style.label}</div>
            <Chip
              {...base}
              shape={shape}
              prefix={{ iconName: "sparkles", variant: style.variant }}
            >
              Prefix
            </Chip>
            <Chip
              {...base}
              shape={shape}
              suffix={{ iconName: "check", variant: style.variant }}
            >
              Suffix
            </Chip>
            <Chip
              {...base}
              shape={shape}
              onClick={noop}
              prefix={{ iconName: "sparkles", variant: style.variant }}
              suffix={{ iconName: "check", variant: style.variant }}
            >
              Clickable
            </Chip>
            <Chip
              {...base}
              shape={shape}
              onClick={noop}
              prefix={{ iconName: "sparkles", variant: style.variant }}
              suffix={{
                iconName: "check",
                variant: style.variant,
                onClick: noop,
              }}
            >
              2 clickable
            </Chip>
            <Chip
              {...base}
              shape={shape}
              onClick={noop}
              prefix={{
                iconName: "sparkles",
                variant: style.variant,
                onClick: noop,
              }}
              suffix={{
                iconName: "check",
                variant: style.variant,
                onClick: noop,
              }}
            >
              3 clickable
            </Chip>
            <Chip
              {...base}
              shape={shape}
              prefix={{ iconName: "sparkles", variant: style.variant }}
              removeable={{ removeable: true, onRemove: noop }}
            >
              Removeable
            </Chip>
          </div>
        );
      })}

      <div className={row}>
        {affixStyles.map((style) => (
          <Chip
            {...base}
            key={style.label}
            shape={style.shape ?? base.shape}
            prefix={{ children: "beta", variant: style.variant }}
            suffix={{ children: "v2", variant: style.variant }}
          >
            {style.label}
          </Chip>
        ))}
      </div>

      <div className={row}>
        {dotStyles.map((dot) => (
          <Chip {...base} key={dot} prefix={{ dot }} suffix={{ dot }}>
            {dot}
          </Chip>
        ))}
      </div>
    </div>
  );
};
PrefixAndSuffix.parameters = { controls: { exclude: ["children"] } };
