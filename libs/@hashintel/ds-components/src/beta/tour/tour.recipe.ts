import { tourAnatomy } from "@ark-ui/react/anatomy";
import { defineSlotRecipe } from "@pandacss/dev";

export const tour = defineSlotRecipe({
  className: "tour",
  slots: tourAnatomy.keys(),
  base: {},
});
