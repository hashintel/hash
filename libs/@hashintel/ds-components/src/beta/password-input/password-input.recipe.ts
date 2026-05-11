import { passwordInputAnatomy } from "@ark-ui/react/anatomy";
import { sva } from "@hashintel/ds-helpers/css";

export const passwordInputSlotRecipe = sva({
  className: "password-input",
  slots: passwordInputAnatomy.keys(),
  base: {},
});
