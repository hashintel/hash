import { css } from "@hashintel/ds-helpers/css";

import { Chip, chipSizes, type ChipColor, type ChipProps } from "./chip";

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

const variants: NonNullable<ChipProps["variant"]>[] = [
  "defined",
  "soft",
  "outline",
  "ghost",
];

const shapes: NonNullable<ChipProps["shape"]>[] = ["default", "round"];

type AffixVariant = "straight" | "badge" | "angle" | "naked";

// The affix `variant`s, plus an optional chip `shape` for the row.
const affixStyles: {
  label: string;
  variant?: AffixVariant;
  shape?: NonNullable<ChipProps["shape"]>;
}[] = [
  { label: "straight", variant: "straight" },
  { label: "naked", variant: "naked" },
  { label: "badge", variant: "badge" },
  { label: "badge (round)", variant: "badge", shape: "round" },
  { label: "angle", variant: "angle" },
];

const dotStyles = ["filled", "partiallyFilled", "empty"] as const;

// Extra per-row examples in the colour story: the badge and "square" (angle)
// affixes, each in blue.
const affixColorExamples: {
  color: ChipColor;
  prefixVariant: AffixVariant;
  label: string;
}[] = [
  { color: "blue", prefixVariant: "badge", label: "badge" },
  { color: "blue", prefixVariant: "angle", label: "angle" },
];

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

const maxWidthChip = css({ maxWidth: "[220px]" });

const longText = "A fairly long chip label that gets truncated";

// `children` is required, so an empty chip passes `""` (via a variable to keep
// eslint's jsx-curly-brace-presence happy).
const emptyLabel = "";

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
      control: { type: "select", options: chipSizes },
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
    variant: "defined",
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
        {affixColorExamples.map((example) => (
          <KitchenSinkChip
            key={`${example.label}-${example.color}`}
            color={example.color}
            variant={variant}
            size={args.size}
            prefixVariant={example.prefixVariant}
          >
            {example.label}
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
          prefixVariant="badge"
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
  <div className={column}>
    <div className={row}>
      {chipSizes.map((size) => (
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

    <div className={row}>
      {chipSizes.map((size) => (
        <KitchenSinkChip
          key={size}
          size={size}
          color={args.color}
          variant={args.variant}
          prefixVariant="badge"
        >
          {size}
        </KitchenSinkChip>
      ))}
    </div>

    {/* md edge cases: empty content, affixes with no label, and truncation of
        long content against a max-width. */}
    <div className={row}>
      <Chip size="md" color={args.color} variant={args.variant}>
        {emptyLabel}
      </Chip>
      <Chip
        size="md"
        color={args.color}
        variant={args.variant}
        prefix={{ iconName: "sparkles" }}
        removeable={{ removeable: true, onRemove: noop }}
      >
        {emptyLabel}
      </Chip>
      <Chip
        size="md"
        color={args.color}
        variant={args.variant}
        className={maxWidthChip}
      >
        {longText}
      </Chip>
      <Chip
        size="md"
        color={args.color}
        variant={args.variant}
        className={maxWidthChip}
        prefix={{ children: "long prefix" }}
        suffix={{ children: "long suffix" }}
      >
        {longText}
      </Chip>
    </div>
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
        // An entry may pin the row's shape (e.g. badge on `round`); otherwise
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
                "aria-label": "Confirm",
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
                "aria-label": "Sparkle",
              }}
              suffix={{
                iconName: "check",
                variant: style.variant,
                onClick: noop,
                "aria-label": "Confirm",
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
