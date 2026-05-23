import { timerAnatomy } from "@ark-ui/react/anatomy";

import { sva } from "@hashintel/ds-helpers/css";

export const timerSlotRecipe = sva({
  className: "timer",
  slots: timerAnatomy.keys(),
  base: {},
});
