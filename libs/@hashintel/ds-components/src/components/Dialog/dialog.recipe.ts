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
      "--dialog-top-padding": "var(--spacing-4)",
      "--dialog-close-button-gap": "var(--spacing-2)",
      position: "relative",
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
      paddingX: "[var(--dialog-horizontal-padding)]",
      paddingTop: "[var(--dialog-top-padding)]",
      paddingBottom: "3.5",
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
      color: "neutral.s90",
      flex: "[0 0 auto]",
      backgroundColor: "neutral.s25",
      borderRadius: "full",
      padding: "1",
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
      marginTop:
        "[calc(var(--dialog-top-padding) * -1 + var(--dialog-close-button-gap))]",
    },
    body: {
      position: "relative",
      flex: "[1 1 auto]",
      minHeight: "0",
      overflow: "auto",
      background: "white",
      border: "[1px solid {colors.neutral.s50}]",
      borderTop: "none",
      borderBottomRadius: "lg",
      color: "fg.body",
      textStyle: "sm",
      paddingX: "[var(--dialog-horizontal-padding)]",
      paddingTop: "4",
      paddingBottom: "5",
    },
    footer: {
      flex: "[0 0 auto]",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "3",
      paddingX: "[var(--dialog-horizontal-padding)]",
      paddingTop: "3.5",
      paddingBottom: "3",
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
      flex: "[0 0 auto]",
      alignSelf: "flex-start",
      marginLeft: "auto",
      position: "relative",
      zIndex: "1",
      marginTop:
        "[calc(var(--dialog-top-padding) * -1 + var(--dialog-close-button-gap))]",
      marginRight:
        "[calc(var(--dialog-horizontal-padding) * -1 + var(--dialog-close-button-gap))]",
    },
    loadingOverlay: {
      position: "absolute",
      inset: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "[rgba(255, 255, 255, 0.9)]",
      zIndex: "1",
      borderRadius: "[inherit]",
      color: "black",
    },
  },
  variants: {
    withPadding: {
      false: {
        body: {
          padding: "[0 !important]",
        },
      },
    },
    size: {
      xs: {
        content: {
          maxWidth: "[400px]",
          "--dialog-horizontal-padding": "var(--spacing-4)",
          "--dialog-top-padding": "var(--spacing-3\\.5)",
        },
        header: {
          paddingBottom: "3",
        },
        body: {
          paddingTop: "4",
          paddingBottom: "4.5",
        },
        footer: {
          paddingTop: "3",
          paddingBottom: "2.5",
        },
      },
      sm: { content: { maxWidth: "[520px]" } },
      md: { content: { maxWidth: "[640px]" } },
      lg: { content: { maxWidth: "[860px]" } },
      xl: { content: { maxWidth: "[1060px]" } },
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
    headerless: {
      true: {
        header: {
          paddingBottom: "1",
          borderBottom: "none",
        },
        body: {
          paddingTop: "0",
          paddingBottom: "6",
        },
      },
    },
    hasIcon: {
      true: {
        description: {
          marginTop: "0.5",
        },
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
