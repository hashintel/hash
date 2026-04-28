import { listboxAnatomy } from "@ark-ui/react/anatomy";
import { defineSlotRecipe } from "@pandacss/dev";

export const listbox = defineSlotRecipe({
  className: "listbox",
  slots: listboxAnatomy.keys(),
  base: {},
});
