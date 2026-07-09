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
      boxShadow:
        "[0 0 0 1px rgba(0, 0, 0, 0.03), 0 1px 2px -1px rgba(0, 0, 0, 0.06), 0 8px 16px -6px rgba(0, 0, 0, 0.09), 0 18px 32px -14px rgba(0, 0, 0, 0.16)]",
      borderRadius: "xl",
      backgroundColor: "neutral.s10",
      padding: "1",

      // The first (bottom-most) dialog scales in/out like a popover.
      _open: {
        animationName: "popoverIn",
        animationDuration: "fast",
      },
      _closed: {
        animationName: "popoverOut",
        animationDuration: "faster",
      },
      // Turn off animating a nested dialog in, as its too noisy on top of animating the lower dialogs into a stack
      '[data-overlay-stack-root]:has([data-part="backdrop"][data-state="open"]) ~ [data-overlay-stack-root] &':
        {
          _open: {
            animationName: "[none]",
          },
          _closed: {
            animationName: "[none]",
          },
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
