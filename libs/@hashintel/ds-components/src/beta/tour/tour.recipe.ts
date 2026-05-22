import { tourAnatomy } from "@ark-ui/react/anatomy";

import { sva } from "@hashintel/ds-helpers/css";

export const tourSlotRecipe = sva({
  className: "tour",
  slots: tourAnatomy.keys(),
  base: {},
});
