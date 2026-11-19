import { sva } from "@hashintel/ds-helpers/css";

export const stageRecipe = sva({
  slots: ["root", "toolbar", "preview", "code"],
  base: {
    root: {
      margin: "0",
      marginBottom: "4",
      paddingInline: "1",
      paddingBottom: "1",
      background: "neutral.a20",
      border: "1px solid {colors.bd.subtle}",
      borderRadius: "[14px]",
    },
    toolbar: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBlock: "1.5",
      paddingInline: "1",
    },
    preview: {
      minHeight: "[200px]",
      background: "neutral.s00",
      border: "1px solid {colors.bd.subtle}",
      borderRadius: "[12px]",
      display: "flex",
      flexWrap: "wrap",
      gap: "3",
      alignItems: "center",
      justifyContent: "center",
      paddingBlock: "10",
      paddingInline: "6",
    },
    code: {
      minHeight: "[200px]",
      background: "neutral.s00",
      border: "1px solid {colors.bd.subtle}",
      borderRadius: "[12px]",
      margin: "0",
      paddingBlock: "4",
      paddingInline: "5",
      overflow: "auto",
      fontFamily: "mono",
      fontSize: "[13px]",
      lineHeight: "[18px]",
      textAlign: "left",
    },
  },
  variants: {
    // Overlay panels sized with viewport units escape OverlayDemo's frame
    // (viewport units ignore containing blocks); this clamps them to it,
    // matched via their own atomic classes so other panels keep their caps.
    clampViewportPanels: {
      true: {
        preview: {
          "& [data-part='content'][class*='100dvh']": {
            maxHeight: "[100%]",
          },
          "& [data-part='content'][class*='100dvw']": {
            maxWidth: "[100%]",
          },
        },
      },
    },
  },
});
