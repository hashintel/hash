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
      "headerRight",
      "hasCustomHeader",
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
      "--dialog-horizontal-padding": "var(--spacing-5\\.5)",
      display: "flex",
      flexDirection: "column",
      width: "[100%]",
      maxHeight: "[calc(100dvh - 2rem)]",
      outline: "none",
      // boxShadow:
      // "[0px 0px 1px 0px rgba(0,0,0,0.02), 0px 1px 1px -0.5px rgba(0,0,0,0.04), 0px 6px 6px -3px rgba(0,0,0,0.04), 0px 12px 12px -6px rgba(0,0,0,0.03), 0px 24px 24px -12px rgba(0,0,0,0.02)]",
      boxShadow: "[0 10px 40px rgba(0, 0, 0, 0.2)]",
      borderRadius: "xl",
      backgroundColor: "neutral.s10",
      padding: "1",

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
      flex: "[0 0 auto]",
      backgroundColor: "white",
      border: "[1px solid {colors.neutral.s50}]",
      borderTopRadius: "lg",
      borderBottom: "[1px solid {colors.neutral.s30}]",
      paddingBottom: "3.5",
      paddingTop: "4",
      paddingX: "[var(--dialog-horizontal-padding)]",
    },
    hasCustomHeader: {
      display: "flex",
      alignItems: "flex-start",
      gap: "2",
      flex: "[1 1 auto]",
      minWidth: "0",
    },
    titleRow: {
      display: "flex",
      alignItems: "center",
      gap: "2",
      flex: "[1 1 auto]",
      minWidth: "0",
    },
    titleIcon: {
      marginLeft: "-0.5",
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
      marginTop: "-0.5",
    },
    headerRight: {
      marginLeft: "auto",
      display: "flex",
      alignItems: "center",
      gap: "[1px]",
    },
    headerActions: {
      display: "flex",
      alignItems: "center",
      gap: "[1px]",
      flex: "[0 0 auto]",
      marginTop: "[calc(var(--spacing-4) * -1 + var(--spacing-2))]",
    },
    body: {
      flex: "[1 1 auto]",
      minHeight: "0",
      overflow: "auto",
      background: "white",
      border: "[1px solid {colors.neutral.s50}]",
      borderTop: "none",
      borderBottomRadius: "lg",
      paddingTop: "4",
      paddingBottom: "5",
      paddingX: "[var(--dialog-horizontal-padding)]",
      color: "fg.body",
      textStyle: "sm",
    },
    footer: {
      flex: "[0 0 auto]",
      paddingX: "[var(--dialog-horizontal-padding)]",
      paddingTop: "3.5",
      paddingBottom: "3",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "3",
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
      marginRight:
        "[calc(var(--dialog-horizontal-padding) * -1 + var(--spacing-2))]",
      marginTop: "[calc(var(--spacing-4) * -1 + var(--spacing-2))]",
      flex: "[0 0 auto]",
      alignSelf: "flex-start",
      marginLeft: "auto",
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
        // header: { padding: "5" },
        // body: { paddingX: "5", paddingY: "4" },
        // footer: { padding: "4" },
      },
      false: {
        // header: { padding: "5", paddingBottom: "0" },
        // body: { padding: "0" },
        // footer: { padding: "4" },
      },
    },
    headerless: {
      true: {
        // body: { paddingTop: "5" },
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
        // body: { paddingTop: "0" },
      },
    },
  ],
  defaultVariants: {
    size: "md",
    withPadding: true,
  },
});
