import { cva, type RecipeVariantProps } from "@hashintel/ds-helpers/css";

const iconRecipeDefinition = {
  className: "icon",
  base: {
    color: "currentcolor",
    display: "inline-block",
    flexShrink: "0",
    verticalAlign: "middle",
    lineHeight: "1em",
  },
  defaultVariants: {
    size: "md",
  },
  variants: {
    size: {
      "2xs": { boxSize: "3" },
      xs: { boxSize: "4" },
      sm: { boxSize: "4.5" },
      md: { boxSize: "5" },
      lg: { boxSize: "5.5" },
      xl: { boxSize: "6" },
    },
  },
} as const;

// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components
export const iconRecipe = cva(iconRecipeDefinition);

export type IconRecipeProps = RecipeVariantProps<typeof iconRecipe>;
