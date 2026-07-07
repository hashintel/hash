import { paginationAnatomy } from "@ark-ui/react/anatomy";

import { type RecipeVariantProps, sva } from "@hashintel/ds-helpers/css";

const paginationSlotRecipeDefinition = {
  className: "pagination",
  slots: paginationAnatomy.keys(),
  base: {},
} as const;

export const paginationSlotRecipe = sva(paginationSlotRecipeDefinition);

export type PaginationSlotRecipeProps = RecipeVariantProps<
  typeof paginationSlotRecipe
>;
