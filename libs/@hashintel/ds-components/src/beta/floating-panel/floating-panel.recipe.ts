import { floatingPanelAnatomy } from "@ark-ui/react/anatomy";
import { defineSlotRecipe } from "@pandacss/dev";

export const floatingPanel = defineSlotRecipe({
  className: "floating-panel",
  slots: floatingPanelAnatomy.keys(),
  base: {},
});
