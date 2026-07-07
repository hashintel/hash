import { cva, type RecipeVariantProps } from "@hashintel/ds-helpers/css";

const badgeRecipeDefinition = {
  className: "badge",
  base: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "l2",
    lineHeight: "1",
    fontWeight: "medium",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    userSelect: "none",
  },
  defaultVariants: {
    variant: "subtle",
    size: "md",
  },
  variants: {
    variant: {
      solid: {
        bg: "colorPalette.solid.bg",
        color: "colorPalette.solid.fg",
      },
      surface: {
        bg: "colorPalette.surface.bg",
        borderWidth: "1px",
        borderColor: "colorPalette.surface.border",
        color: "colorPalette.surface.fg",
      },
      subtle: {
        bg: "colorPalette.subtle.bg",
        color: "colorPalette.subtle.fg",
      },
      outline: {
        borderWidth: "1px",
        borderColor: "colorPalette.outline.border",
        color: "colorPalette.outline.fg",
      },
    },
    size: {
      sm: {
        fontSize: "xs",
        px: "1.5",
        h: "4.5",
        gap: "0.5",
        _icon: { boxSize: "2.5" },
      },
      md: {
        fontSize: "xs",
        px: "2",
        h: "5",
        gap: "1",
        _icon: { boxSize: "3" },
      },
      lg: {
        fontSize: "xs",
        px: "2.5",
        h: "5.5",
        gap: "1",
        _icon: { boxSize: "3.5" },
      },
      xl: {
        fontSize: "sm",
        px: "2.5",
        h: "6",
        gap: "1.5",
        _icon: { boxSize: "4" },
      },
      "2xl": {
        fontSize: "md",
        px: "3",
        h: "7",
        gap: "1.5",
        _icon: { boxSize: "4.5" },
      },
    },
  },
} as const;

// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components
export const badgeRecipe = cva(badgeRecipeDefinition);

export type BadgeRecipeProps = RecipeVariantProps<typeof badgeRecipe>;
