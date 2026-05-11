import { floatingPanelAnatomy } from "@ark-ui/react/anatomy";
import { sva } from "@hashintel/ds-helpers/css";

export const floatingPanelSlotRecipe = sva({
  className: "floating-panel",
  slots: floatingPanelAnatomy.keys(),
  base: {},
});
