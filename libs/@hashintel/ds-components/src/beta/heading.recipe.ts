import { cva, type RecipeVariantProps } from "@hashintel/ds-helpers/css";

const headingRecipeDefinition = {
  className: "heading",
  base: {
    fontWeight: "semibold",
  },
} as const;

export const headingRecipe = cva(headingRecipeDefinition);

export type HeadingRecipeProps = RecipeVariantProps<typeof headingRecipe>;
