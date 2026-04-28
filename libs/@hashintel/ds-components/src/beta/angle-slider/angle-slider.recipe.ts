import { angleSliderAnatomy } from "@ark-ui/react/anatomy";
import { defineSlotRecipe } from "@pandacss/dev";

export const angleSlider = defineSlotRecipe({
  className: "angleSlider",
  slots: angleSliderAnatomy.keys(),
  base: {},
});
