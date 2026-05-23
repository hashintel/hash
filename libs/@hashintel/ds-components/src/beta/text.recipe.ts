import { cva, type RecipeVariantProps } from "@hashintel/ds-helpers/css";

const textRecipeDefinition = {
  className: "text",
  variants: {},
} as const;

export const textRecipe = cva(textRecipeDefinition);

export type TextRecipeProps = RecipeVariantProps<typeof textRecipe>;
