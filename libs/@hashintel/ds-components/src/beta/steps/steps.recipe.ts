import { stepsAnatomy } from "@ark-ui/react/anatomy";
import { sva } from "@hashintel/ds-helpers/css";

export const stepsSlotRecipe = sva({
  className: "steps",
  slots: stepsAnatomy.keys(),
  base: {},
});
