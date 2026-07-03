import { drawerAnatomy } from "@ark-ui/react/anatomy";

import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  className: "drawer",
  slots: drawerAnatomy
    .extendWith(
      "stackRoot",
      "header",
      "headerMain",
      "headerText",
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
      "loadingSpinner",
    )
    .keys(),
  base: {
    stackRoot: {
      display: "contents",
      // Hide the backdrop of any drawer that has a nested drawer above it so
      // the overlay doesn't darken cumulatively as the stack grows.
      '&:has([data-scope="drawer"][data-part="content"][data-has-nested]) [data-scope="drawer"][data-part="backdrop"]':
        {
          visibility: "hidden",
        },
    },
    backdrop: {
      background: "black.a60",
      position: "fixed",
      inset: "0",
      width: "[100dvw]",
      height: "[100dvh]",
      zIndex: "modal",
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
      // Anchor the drawer to the trailing (right) edge, stretched to the full
      // viewport height.
      justifyContent: "flex-end",
      alignItems: "stretch",
      position: "fixed",
      inset: "0",
      width: "[100dvw]",
      height: "[100dvh]",
      // The panel itself is full height and scrolls its own body, so the
      // slid-in content is clipped rather than producing a page scrollbar.
      overflow: "hidden",
      overscrollBehaviorY: "none",
      zIndex: "modal",
    },
    content: {
      "--drawer-horizontal-padding": "var(--spacing-5\\.5)",
      "--drawer-top-padding": "var(--spacing-4)",
      "--drawer-close-button-gap": "var(--spacing-2)",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      // Sized to `maxWidth` (per size), pinned to the right edge and stretched
      // to the full viewport height like a side sheet.
      width: "[100%]",
      height: "[100dvh]",
      maxHeight: "[100dvh]",
      outline: "none",
      // Shadow spills to the left, into the viewport it slides over.
      boxShadow: "[-10px 0 40px rgba(0, 0, 0, 0.2)]",
      // Only the leading (left) edge is rounded; the trailing edge sits flush
      // against the side of the viewport.
      borderTopLeftRadius: "xl",
      borderBottomLeftRadius: "xl",
      borderTopRightRadius: "[0]",
      borderBottomRightRadius: "[0]",
      backgroundColor: "neutral.s10",
      padding: "1",
      // Smoothly animate the swipe snap-back when a drag doesn't cross the
      // dismiss threshold. Ark UI zeroes this out inline while actively
      // dragging, so the panel still tracks the pointer 1:1.
      transition: "[transform 0.2s ease]",

      _open: {
        animationName: "drawerSlideIn",
        animationDuration: "normal",
      },
      _closed: {
        animationName: "drawerSlideOut",
        animationDuration: "fast",
      },
    },
    header: {
      flex: "[0 0 auto]",
      backgroundColor: "white",
      border: "[1px solid {colors.neutral.s50}]",
      borderTopRadius: "lg",
      borderBottom: "[1px solid {colors.neutral.s30}]",
      paddingX: "[var(--drawer-horizontal-padding)]",
      paddingTop: "[var(--drawer-top-padding)]",
      paddingBottom: "3.5",
    },
    hasCustomHeader: {
      display: "flex",
      alignItems: "flex-start",
      gap: "2",
      flex: "[1 1 auto]",
      minWidth: "0",
    },
    headerMain: {},
    headerText: {},
    titleIcon: {
      float: "start",
      marginLeft: "-0.5",
      marginRight: "2",
      color: "neutral.s90",
      flex: "[0 0 auto]",
      backgroundColor: "neutral.s25",
      borderRadius: "full",
      padding: "1",
      alignSelf: "flex-start",
      top: "[1.5px]",
      position: "relative",
    },
    title: {
      display: "inline",
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
      float: "end",
      display: "flex",
      alignItems: "center",
      gap: "[1px]",
    },
    headerActions: {
      display: "flex",
      marginLeft: "auto",
      alignItems: "center",
      gap: "[1px]",
      flex: "[0 0 auto]",
      marginTop:
        "[calc(var(--drawer-top-padding) * -1 + var(--drawer-close-button-gap))]",
    },
    body: {
      position: "relative",
      flex: "[1 1 auto]",
      minHeight: "0",
      overflow: "auto",
      scrollbarWidth: "[thin]",
      background: "white",
      border: "[1px solid {colors.neutral.s50}]",
      borderTop: "none",
      color: "fg.body",
      textStyle: "sm",
      paddingX: "[var(--drawer-horizontal-padding)]",
      paddingTop: "4",
      paddingBottom: "5",
      // While loading, lock the body's scroll so the absolutely-positioned
      // overlay stays pinned to the visible area instead of riding the
      // scrolled content.
      '[aria-busy="true"] &': {
        overflow: "hidden",
      },
      _focusVisible: {
        outlineColor: "neutral.a50",
      },
    },
    footer: {
      flex: "[0 0 auto]",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "3",
      paddingX: "[var(--drawer-horizontal-padding)]",
      paddingTop: "3.5",
      paddingBottom: "3",
    },
    footerActions: {
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: "2",
      marginLeft: "auto",
    },
    footerSecondaryActions: {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "2",
    },
    closeButton: {
      flex: "[0 0 auto]",
      marginLeft: "auto",
      float: "end",
      position: "relative",
      zIndex: "[1]",
      marginTop:
        "[calc(var(--drawer-top-padding) * -1 + var(--drawer-close-button-gap))]",
      marginRight:
        "[calc(var(--drawer-horizontal-padding) * -1 + var(--drawer-close-button-gap))]",
    },
    loadingOverlay: {
      position: "absolute",
      inset: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "[rgba(255, 255, 255, 0.88)]",
      zIndex: "[1]",
      borderRadius: "[inherit]",
    },
    loadingSpinner: {
      width: "[auto !important]",
      aspectRatio: "1",
      maxHeight: "[60%]",
      color: "black",
    },
  },
  variants: {
    size: {
      sm: {
        content: { maxWidth: "[520px]" },
        loadingSpinner: { height: "[38px !important]" },
      },
      md: {
        content: { maxWidth: "[640px]" },
        loadingSpinner: { height: "[40px !important]" },
        headerMain: { display: "flex", alignItems: "flex-start", gap: "2" },
        titleIcon: { marginRight: "0" },
        headerText: { flex: "[1 1 auto]", minWidth: "[0]" },
      },
      lg: {
        content: { maxWidth: "[860px]" },
        loadingSpinner: {
          height: "[45px !important]",
          color: "neutral.s115",
        },
        headerMain: { display: "flex", alignItems: "flex-start", gap: "2" },
        titleIcon: { marginRight: "0" },
        headerText: { flex: "[1 1 auto]", minWidth: "[0]" },
      },
      xl: {
        content: { maxWidth: "[1060px]" },
        loadingSpinner: {
          height: "[50px !important]",
          color: "neutral.s115",
        },
        headerMain: { display: "flex", alignItems: "flex-start", gap: "2" },
        titleIcon: { marginRight: "0" },
        headerText: { flex: "[1 1 auto]", minWidth: "[0]" },
      },
    },
    variant: {
      partitionedFooter: {
        body: {
          borderBottomRadius: "lg",
        },
      },
      plain: {
        header: {
          borderBottomColor: "neutral.s20",
        },
        body: {
          borderBottom: "none",
        },
        footer: {
          backgroundColor: "white",
          border: "[1px solid {colors.neutral.s50}]",
          borderBottomRadius: "lg",
          borderTop: "[1px solid {colors.neutral.s20}]",
        },
      },
    },
    hasIcon: {
      true: {
        description: { marginTop: "0.5" },
      },
    },
    headerless: {
      true: {
        header: {
          paddingBottom: "0",
          borderBottom: "none",
        },
        closeButton: {
          marginBottom: "-1.5",
        },
        body: {
          paddingTop: "0",
          paddingBottom: "6",
        },
      },
    },
  },
  defaultVariants: {
    size: "md",
  },
});
