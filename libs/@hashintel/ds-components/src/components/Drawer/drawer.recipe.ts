import { drawerAnatomy } from "@ark-ui/react/anatomy";

import { sva } from "@hashintel/ds-helpers/css";

/**
 * The header / body / footer chrome is shared with the Dialog and lives in
 * `../../util/overlay-parts.recipe`; the `--panel-*` custom properties
 * declared on `content` below feed that shared chrome via inheritance.
 */
export const styles = sva({
  className: "drawer",
  slots: drawerAnatomy.extendWith("stackRoot").keys(),
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
        animationDuration: "faster",
      },
      _closed: {
        animationName: "fadeOut",
        animationDuration: "fastest",
      },
    },
    positioner: {
      display: "flex",
      justifyContent: "flex-end",
      alignItems: "stretch",
      position: "fixed",
      inset: "0",
      width: "[100dvw]",
      height: "[100dvh]",
      overflow: "hidden",
      overscrollBehaviorY: "none",
      zIndex: "modal",
    },
    content: {
      "--panel-horizontal-padding": "var(--spacing-5\\.5)",
      "--panel-top-padding": "var(--spacing-4)",
      "--panel-close-button-gap": "var(--spacing-3\\.5)",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      width: "[100%]",
      height: "[100dvh]",
      maxHeight: "[100dvh]",
      outline: "none",
      boxShadow: "[-10px 0 40px rgba(0, 0, 0, 0.2)]",
      borderTopLeftRadius: "xl",
      borderBottomLeftRadius: "xl",
      borderTopRightRadius: "[0]",
      borderBottomRightRadius: "[0]",
      backgroundColor: "neutral.s10",
      padding: "1",
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
  },
  variants: {
    size: {
      sm: {
        content: {
          maxWidth: "[520px]",
          "--panel-horizontal-padding": "var(--spacing-4)",
          "--panel-top-padding": "var(--spacing-3\\.5)",
          "--panel-close-button-gap": "var(--spacing-2\\.5)",
        },
      },
      md: {
        content: { maxWidth: "[640px]" },
      },
      lg: {
        content: { maxWidth: "[860px]" },
      },
      xl: {
        content: { maxWidth: "[1060px]" },
      },
    },
  },
  defaultVariants: {
    size: "md",
  },
});
