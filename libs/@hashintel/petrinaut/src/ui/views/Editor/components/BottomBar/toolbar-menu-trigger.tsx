import { Icon, type IconName } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import type { ToolbarTone } from "./toolbar-button";

const triggerStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "[2px]",
    border: "none",
    borderRadius: "lg",
    cursor: "pointer",
    transition: "[all 0.2s ease]",
    backgroundColor: "[transparent]",
    color: "neutral.s110",
    height: "8",
    paddingX: "[6px]",
    fontSize: "xl",
    "& > *": {
      transition: "[transform 0.2s ease, background-color 0.2s ease]",
    },
    _hover: {
      color: "neutral.s120",
      "& > *": {
        transform: "[scale(1.05)]",
      },
    },
    _active: {
      "& > *": {
        transform: "[scale(0.95)]",
      },
    },
  },
  variants: {
    isActive: {
      true: {
        color: "[#3b82f6]",
        _hover: {
          color: "[#2563eb]",
        },
      },
    },
    appearance: {
      plain: {},
      filled: {
        paddingLeft: "[2px]",
      },
    },
  },
});

/**
 * The filled appearance keeps the glyph in a tinted square and leaves the
 * chevron outside it, so the square reads as the mode and the chevron as the
 * menu.
 */
const glyphBoxStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  variants: {
    appearance: {
      plain: {},
      filled: {
        width: "7",
        height: "7",
        borderRadius: "md",
        color: "[white]",
      },
    },
    tone: {
      brand: {},
      simulation: {},
    },
  },
  compoundVariants: [
    {
      appearance: "filled",
      tone: "brand",
      css: { backgroundColor: "[#3b82f6]" },
    },
    {
      appearance: "filled",
      tone: "simulation",
      css: { backgroundColor: "[#8b5cf6]" },
    },
  ],
});

const chevronStyle = css({
  opacity: "[0.5]",
});

/**
 * The button a toolbar dropdown opens from: the mode it would apply, and a
 * chevron saying there is a choice behind it.
 *
 * Every other prop reaches the `button`, ref included. `Menu` mounts its
 * trigger through Ark's `asChild`, which clones this element to attach the
 * click handling, the trigger ref and its ARIA — anything this component keeps
 * to itself never reaches the DOM, and the menu then does not open.
 */
export const ToolbarMenuTrigger = ({
  icon,
  isActive,
  appearance = "plain",
  tone = "brand",
  ...buttonProps
}: {
  icon: IconName;
  isActive: boolean;
  /** `filled` paints the glyph on a square in the tone; `plain` colours it. */
  appearance?: "plain" | "filled";
  tone?: ToolbarTone;
} & React.ComponentPropsWithRef<"button">) => (
  <button
    type="button"
    {...buttonProps}
    className={triggerStyle({ isActive, appearance })}
  >
    <span className={glyphBoxStyle({ appearance, tone })}>
      <Icon name={icon} />
    </span>
    <Icon name="chevronDown" size="xs" className={chevronStyle} />
  </button>
);
