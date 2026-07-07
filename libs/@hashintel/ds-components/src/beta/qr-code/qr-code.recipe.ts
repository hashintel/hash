import { qrCodeAnatomy } from "@ark-ui/react/anatomy";

import { sva } from "@hashintel/ds-helpers/css";

export const qrCodeSlotRecipe = sva({
  className: "qr-code",
  slots: qrCodeAnatomy.keys(),
  base: {},
});
