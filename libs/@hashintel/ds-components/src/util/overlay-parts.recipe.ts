import { sva } from "@hashintel/ds-helpers/css";

/**
 * Shared slot styles for the Dialog and Drawer components: the dimmed
 * `backdrop` plus the header / body / footer chrome. Each component owns its own
 * recipe for the remaining structural slots (positioner, content, stackRoot).
 *
 * The `--panel-*` custom properties consumed below are declared on each
 * component's `content` slot (the chrome's ancestor) and inherited down, so the
 * two components can tune horizontal/top padding without diverging this recipe.
 */
export const overlayPartsStyles = sva({
  className: "panel",
  slots: [
    "backdrop",
    "header",
    "hasCustomHeader",
    "headerMain",
    "headerText",
    "titleIcon",
    "title",
    "description",
    "headerRight",
    "headerActions",
    "body",
    "footer",
    "footerActions",
    "footerSecondaryActions",
    "closeButton",
    "loadingOverlay",
    "loadingSpinner",
  ],
  base: {
    backdrop: {
      background: "black.a60",
      position: "fixed",
      inset: "0",
      width: "[100dvw]",
      height: "[100dvh]",
      zIndex: "modal",
      _open: {
        animationName: "fadeIn",
      },
      _closed: {
        animationName: "fadeOut",
      },
      // Hide this backdrop while a later sibling overlay has an open backdrop of its own.
      '[data-overlay-stack-root]:has(~ [data-overlay-stack-root] [data-part="backdrop"][data-state="open"]) &':
        {
          visibility: "hidden",
        },
      // Freeze this backdrop's fade while an earlier sibling is already dimming
      // behind it
      '[data-overlay-stack-root]:has([data-part="backdrop"][data-state="open"]) ~ [data-overlay-stack-root] &':
        {
          animationName: "[none]",
        },
    },
    header: {
      flex: "[0 0 auto]",
      backgroundColor: "white",
      border: "[1px solid {colors.neutral.s50}]",
      borderTopRadius: "lg",
      borderBottom: "[1px solid {colors.neutral.s30}]",
      paddingX: "[var(--panel-horizontal-padding)]",
      paddingTop: "[var(--panel-top-padding)]",
      paddingBottom: "3.5",
      '[data-drawer-position="right"] &': { borderTopRightRadius: "[0]" },
      '[data-drawer-position="left"] &': { borderTopLeftRadius: "[0]" },
      '[data-drawer-position="top"] &': {
        borderTopLeftRadius: "[0]",
        borderTopRightRadius: "[0]",
      },
    },
    hasCustomHeader: {
      display: "flex",
      alignItems: "flex-start",
      gap: "2",
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
        "[calc(var(--panel-top-padding) * -1 + var(--panel-close-button-gap))]",
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
      paddingX: "[var(--panel-horizontal-padding)]",
      paddingTop: "4",
      paddingBottom: "5",
      '[data-drawer-position="right"] &': { borderBottomRightRadius: "[0]" },
      '[data-drawer-position="left"] &': { borderBottomLeftRadius: "[0]" },
      '[data-drawer-position="bottom"] &': {
        "&:last-child": {
          borderBottomLeftRadius: "[0]",
          borderBottomRightRadius: "[0]",
        },
      },
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
      paddingX: "[var(--panel-horizontal-padding)]",
      paddingTop: "3.5",
      paddingBottom: "3",
      '[data-drawer-position="right"] &': { borderBottomRightRadius: "[0]" },
      '[data-drawer-position="left"] &': { borderBottomLeftRadius: "[0]" },
      '[data-drawer-position="bottom"] &': {
        borderBottomLeftRadius: "[0]",
        borderBottomRightRadius: "[0]",
      },
    },
    footerActions: {
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: "2",
      marginLeft: "auto",
      minWidth: "[0]",
    },
    footerSecondaryActions: {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "2",
      minWidth: "[0]",
      flex: "[1 1 50%]",
    },
    closeButton: {
      flex: "[0 0 auto]",
      marginLeft: "auto",
      float: "end",
      position: "relative",
      zIndex: "[1]",
      marginTop:
        "[calc(var(--panel-top-padding) * -1 + var(--panel-close-button-gap))]",
      marginRight:
        "[calc(var(--panel-horizontal-padding) * -1 + var(--panel-close-button-gap))]",
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
      xs: {
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
      sm: {
        loadingSpinner: { height: "[38px !important]" },
      },
      md: {
        loadingSpinner: { height: "[40px !important]" },
        headerMain: { display: "flex", alignItems: "flex-start", gap: "2" },
        titleIcon: { marginRight: "0" },
        headerText: { flex: "[1 1 auto]", minWidth: "[0]" },
      },
      lg: {
        loadingSpinner: {
          height: "[45px !important]",
          color: "neutral.s115",
        },
        headerMain: { display: "flex", alignItems: "flex-start", gap: "2" },
        titleIcon: { marginRight: "0" },
        headerText: { flex: "[1 1 auto]", minWidth: "[0]" },
      },
      xl: {
        loadingSpinner: {
          height: "[50px !important]",
          color: "neutral.s115",
        },
        headerMain: { display: "flex", alignItems: "flex-start", gap: "2" },
        titleIcon: { marginRight: "0" },
        headerText: { flex: "[1 1 auto]", minWidth: "[0]" },
      },
      fullScreen: {
        loadingSpinner: {
          height: "[50px !important]",
          color: "neutral.s110",
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
          "&:last-child": {
            borderBottomRadius: "lg",
            borderBottom: "[1px solid {colors.neutral.s50}]",
          },
        },
        footer: {
          backgroundColor: "white",
          border: "[1px solid {colors.neutral.s50}]",
          borderBottomRadius: "lg",
          borderTop: "[1px solid {colors.neutral.s20}]",
        },
      },
    },
    component: {
      dialog: {
        backdrop: {
          _open: { animationDuration: "fast" },
          _closed: { animationDuration: "faster" },
        },
      },
      drawer: {
        backdrop: {
          _open: { animationDuration: "faster" },
          _closed: { animationDuration: "fastest" },
        },
      },
      popover: {
        body: {
          border: "none",
          borderRadius: "lg",
          boxShadow:
            "[0px 0px 0px 1px rgba(0, 0, 0, 0.06), 0px 1px 1px -0.5px rgba(0, 0, 0, 0.04)]",
          marginX: "1",
          marginBottom: "1",
          paddingX: "3",
          paddingTop: "2.5",
          paddingBottom: "2.5",
          "&:first-child": { marginTop: "1" },
        },
        footer: {
          paddingX: "3",
          paddingTop: "1",
          paddingBottom: "2",
        },
        footerActions: {
          gapY: "1",
        },
        footerSecondaryActions: {
          gapY: "1",
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
  compoundVariants: [
    {
      headerless: true,
      size: "xs",
      css: {
        header: {
          paddingBottom: "0",
        },
        body: {
          paddingBottom: "5",
        },
      },
    },
  ],
  defaultVariants: {
    size: "md",
  },
});
