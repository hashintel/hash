import { dialogAnatomy } from "@ark-ui/react/anatomy";

import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  className: "dialog",
  slots: dialogAnatomy
    .extendWith(
      "header",
      "titleRow",
      "titleIcon",
      "headerActions",
      "body",
      "footer",
      "footerActions",
      "footerSecondaryActions",
      "closeButton",
      "loadingOverlay",
    )
    .keys(),
  base: {
    backdrop: {
      background: "black.a60",
      position: "fixed",
      inset: "0",
      width: "[100dvw]",
      height: "[100dvh]",
      zIndex: "zIndex.modal",
      _open: {
        animationName: "fadeIn",
        animationDuration: "normal",
      },
      _closed: {
        animationName: "fadeOut",
        animationDuration: "fast",
      },
    },
    positioner: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "fixed",
      inset: "0",
      width: "[100dvw]",
      height: "[100dvh]",
      overflow: "auto",
      overscrollBehaviorY: "none",
      zIndex: "zIndex.modal",
      padding: "4",
    },
    content: {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      background: "white",
      borderRadius: "lg",
      boxShadow: "[0 10px 40px rgba(0, 0, 0, 0.2)]",
      width: "[100%]",
      maxHeight: "[calc(100dvh - 2rem)]",
      outline: "none",
      overflow: "hidden",
      _open: {
        animationName: "fadeIn",
        animationDuration: "normal",
      },
      _closed: {
        animationName: "fadeOut",
        animationDuration: "fast",
      },
    },
    header: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "3",
      flex: "[0 0 auto]",
    },
    titleRow: {
      display: "flex",
      alignItems: "center",
      gap: "2",
      flex: "[1 1 auto]",
      minWidth: "0",
    },
    titleIcon: {
      color: "fg.muted",
      flex: "[0 0 auto]",
    },
    title: {
      fontWeight: "semibold",
      textStyle: "lg",
      color: "fg.body",
    },
    description: {
      color: "fg.muted",
      textStyle: "sm",
      marginTop: "1",
    },
    headerActions: {
      display: "flex",
      alignItems: "center",
      gap: "2",
      flex: "[0 0 auto]",
    },
    body: {
      display: "flex",
      flexDirection: "column",
      flex: "[1 1 auto]",
      minHeight: "0",
      overflow: "auto",
      color: "fg.body",
      textStyle: "sm",
    },
    footer: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "3",
      flex: "[0 0 auto]",
      borderTop: "[1px solid]",
      borderColor: "neutral.a50",
    },
    footerActions: {
      display: "flex",
      alignItems: "center",
      gap: "2",
      marginLeft: "auto",
    },
    footerSecondaryActions: {
      display: "flex",
      alignItems: "center",
      gap: "2",
    },
    closeButton: {
      position: "absolute",
      top: "3",
      right: "3",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "7",
      height: "7",
      padding: "0",
      borderRadius: "md",
      background: "[transparent]",
      border: "none",
      cursor: "pointer",
      color: "fg.muted",
      transition: "[background 0.15s ease, color 0.15s ease]",
      "&:hover": {
        background: "neutral.a20",
        color: "fg.body",
      },
      "&:focus-visible": {
        outline: "[2px solid]",
        outlineColor: "neutral.s30",
        outlineOffset: "[2px]",
      },
    },
    loadingOverlay: {
      position: "absolute",
      inset: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "[rgba(255, 255, 255, 0.7)]",
      zIndex: "1",
    },
  },
  variants: {
    size: {
      xs: { content: { maxWidth: "[20rem]" } },
      sm: { content: { maxWidth: "[24rem]" } },
      md: { content: { maxWidth: "[32rem]" } },
      lg: { content: { maxWidth: "[42rem]" } },
      xl: { content: { maxWidth: "[56rem]" } },
      fullScreen: {
        positioner: { padding: "0" },
        content: {
          maxWidth: "[100dvw]",
          width: "[100dvw]",
          height: "[100dvh]",
          maxHeight: "[100dvh]",
          borderRadius: "[0]",
        },
      },
    },
    withPadding: {
      true: {
        header: { padding: "5" },
        body: { paddingX: "5", paddingY: "4" },
        footer: { padding: "4" },
      },
      false: {
        header: { padding: "5", paddingBottom: "0" },
        body: { padding: "0" },
        footer: { padding: "4" },
      },
    },
    headerless: {
      true: {
        body: { paddingTop: "5" },
      },
    },
    footerless: {
      true: {
        footer: { display: "none" },
      },
    },
  },
  compoundVariants: [
    {
      withPadding: false,
      headerless: true,
      css: {
        body: { paddingTop: "0" },
      },
    },
  ],
  defaultVariants: {
    size: "md",
    withPadding: true,
  },
});
