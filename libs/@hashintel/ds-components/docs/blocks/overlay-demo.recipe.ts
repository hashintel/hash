import { sva } from "@hashintel/ds-helpers/css";

export const overlayDemoRecipe = sva({
  slots: ["frame"],
  base: {
    frame: {
      position: "relative",
      display: "flex",
      flexWrap: "wrap",
      gap: "3",
      alignItems: "center",
      justifyContent: "center",
      width: "[100%]",
      minHeight: "[320px]",
      overflow: "hidden",
      borderRadius: "[8px]",
      // Containing block for the overlays' `position: fixed`, so backdrops
      // and panels stay inside the demo frame.
      transform: "[translateZ(0)]",
      // Dialog/Drawer positioners size themselves with viewport units, which
      // ignore the containing block — clamp them to the frame instead. Scoped
      // so Popover's anchored positioner keeps its natural content width.
      // The compound selector outweighs the overlays' own atomic classes.
      "& :is([data-scope='dialog'], [data-scope='drawer'])[data-part='positioner']":
        {
          width: "[100%]",
          height: "[100%]",
          minHeight: "[0]",
        },
    },
  },
});
