import { pinInputAnatomy } from "@ark-ui/react/anatomy";

import { type RecipeVariantProps, sva } from "@hashintel/ds-helpers/css";

import { inputRecipeConfig } from "./input.recipe";

const pinInputSlotRecipeDefinition = {
  className: "pin-input",
  slots: pinInputAnatomy.keys(),
  base: {
    input: {
      ...inputRecipeConfig.base,
      textAlign: "center",
      width: "var(--input-height)",
      px: "1!",
    },
    control: {
      display: "inline-flex",
      gap: "2",
      isolation: "isolate",
    },
  },
  defaultVariants: {
    size: "md",
    variant: "outline",
  },

  variants: {
    size: {
      xs: {
        input: inputRecipeConfig.variants.size.xs,
      },
      sm: {
        input: inputRecipeConfig.variants.size.sm,
      },
      md: {
        input: inputRecipeConfig.variants.size.md,
      },
      lg: {
        input: inputRecipeConfig.variants.size.lg,
      },
      xl: {
        input: inputRecipeConfig.variants.size.xl,
      },
      "2xl": {
        input: inputRecipeConfig.variants.size["2xl"],
      },
    },
    variant: {
      outline: { input: inputRecipeConfig.variants.variant.outline },
      subtle: { input: inputRecipeConfig.variants.variant.subtle },
      flushed: { input: inputRecipeConfig.variants.variant.flushed },
    },
  },
} as const;

// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components
export const pinInputSlotRecipe = sva(pinInputSlotRecipeDefinition);

export type PinInputSlotRecipeProps = RecipeVariantProps<typeof pinInputSlotRecipe>;
