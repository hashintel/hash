import { signaturePadAnatomy } from "@ark-ui/react/anatomy";
import { sva } from "@hashintel/ds-helpers/css";

export const signaturePadSlotRecipe = sva({
  className: "signature-pad",
  slots: signaturePadAnatomy.keys(),
  base: {},
});
