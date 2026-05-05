import { toggleAnatomy } from "@ark-ui/react/anatomy";
import { defineSlotRecipe } from "@pandacss/dev";

export const toggle = defineSlotRecipe({
  className: "toggle",
  slots: toggleAnatomy.keys(),
  base: {},
});
