import { listboxAnatomy } from "@ark-ui/react/anatomy";

import { sva } from "@hashintel/ds-helpers/css";

export const listboxSlotRecipe = sva({
  className: "listbox",
  slots: listboxAnatomy.keys(),
  base: {},
});
