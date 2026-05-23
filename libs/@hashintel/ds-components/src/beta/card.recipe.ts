import { type RecipeVariantProps, sva } from "@hashintel/ds-helpers/css";

const cardSlotRecipeDefinition = {
  className: "card",
  slots: ["root", "header", "body", "footer", "title", "description"],
  base: {
    root: {
      borderRadius: "l3",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      position: "relative",
    },
    header: {
      display: "flex",
      flexDirection: "column",
      gap: "1",
      p: "6",
    },
    body: {
      display: "flex",
      flex: "1",
      flexDirection: "column",
      pb: "6",
      px: "6",
    },
    footer: {
      display: "flex",
      justifyContent: "flex-end",
      gap: "3",
      pb: "6",
      pt: "2",
      px: "6",
    },
    title: {
      textStyle: "lg",
      fontWeight: "semibold",
    },
    description: {
      color: "fg.muted",
      textStyle: "sm",
    },
  },
  defaultVariants: {
    variant: "outline",
  },
  variants: {
    variant: {
      elevated: {
        root: {
          bg: "gray.surface.bg",
          boxShadow: "lg",
        },
      },
      outline: {
        root: {
          bg: "gray.surface.bg",
          borderWidth: "1px",
        },
      },
      subtle: {
        root: {
          bg: "gray.subtle.bg",
        },
      },
    },
  },
} as const;

// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components
export const cardSlotRecipe = sva(cardSlotRecipeDefinition);

export type CardSlotRecipeProps = RecipeVariantProps<typeof cardSlotRecipe>;
