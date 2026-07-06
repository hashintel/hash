import { dialogAnatomy } from "@ark-ui/react/anatomy";

import { sva } from "@hashintel/ds-helpers/css";

/**
 * The header / body / footer chrome is shared with the Drawer and lives in
 * `../../util/overlay-parts.recipe`; the `--panel-*` custom properties
 * declared on `content` below feed that shared chrome via inheritance.
 */
export const styles = sva({
  className: "dialog",
  slots: dialogAnatomy.extendWith("stackRoot").keys(),
  base: {
    stackRoot: {
      display: "contents",
      // Hide the backdrop of any dialog that has a nested dialog above it so
      // the overlay doesn't darken cumulatively as the stack grows.
      '&:has([data-scope="dialog"][data-part="content"][data-has-nested]) [data-scope="dialog"][data-part="backdrop"]':
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
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      position: "fixed",
      inset: "0",
      width: "[100dvw]",
      height: "[100dvh]",
      overflow: "auto",
      overscrollBehaviorY: "none",
      zIndex: "modal",
      padding: "4",
      // Bias the dialog slightly above center: spacers split free vertical
      // space 35/65 and shrink to 0 when the content fills the viewport.
      _before: {
        content: '""',
        flex: "[38 1 0]",
      },
      _after: {
        content: '""',
        flex: "[62 1 0]",
      },
    },
    content: {
      "--panel-horizontal-padding": "var(--spacing-5\\.5)",
      "--panel-top-padding": "var(--spacing-4)",
      "--panel-close-button-gap": "var(--spacing-3\\.5)",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      width: "[100%]",
      maxHeight: "[calc(100dvh - 2rem)]",
      outline: "none",
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
      // When another dialog is opened on top, shift this one up-and-left by
      // 30px per layer above it so the stack reads visually.
      "&[data-has-nested]": {
        transition: "[transform 0.10s ease]",
        transform:
          "translate(calc(var(--nested-layer-count) * -22px), calc(var(--nested-layer-count) * -22px))",
      },
    },
  },
  variants: {
    size: {
      xs: {
        content: {
          maxWidth: "[400px]",
          "--panel-horizontal-padding": "var(--spacing-4)",
          "--panel-top-padding": "var(--spacing-3\\.5)",
          "--panel-close-button-gap": "var(--spacing-2\\.5)",
        },
      },
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
  },
  defaultVariants: {
    size: "md",
  },
});
