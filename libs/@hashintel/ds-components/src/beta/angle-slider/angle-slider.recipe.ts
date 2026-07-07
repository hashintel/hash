import { angleSliderAnatomy } from "@ark-ui/react/anatomy";

import { sva } from "@hashintel/ds-helpers/css";

export const angleSliderSlotRecipe = sva({
  className: "angleSlider",
  slots: angleSliderAnatomy.keys(),
  base: {},
});
