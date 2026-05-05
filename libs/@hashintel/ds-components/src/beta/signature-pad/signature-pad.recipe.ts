import { signaturePadAnatomy } from "@ark-ui/react/anatomy";
import { defineSlotRecipe } from "@pandacss/dev";

export const signaturePad = defineSlotRecipe({
  className: "signature-pad",
  slots: signaturePadAnatomy.keys(),
  base: {},
});
