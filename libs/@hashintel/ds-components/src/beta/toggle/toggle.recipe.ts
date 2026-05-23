import { toggleAnatomy } from "@ark-ui/react/anatomy";

import { sva } from "@hashintel/ds-helpers/css";

export const toggleSlotRecipe = sva({
  className: "toggle",
  slots: toggleAnatomy.keys(),
  base: {},
});
