import { drawerAnatomy } from "@ark-ui/react/anatomy";

import { sva } from "@hashintel/ds-helpers/css";

/**
 * The header / body / footer chrome is shared with the Dialog and lives in
 * `../../util/overlay-parts.recipe`; the `--panel-*` custom properties declared
 * on `content` below feed that shared chrome via inheritance.
 *
 * The drawer can be anchored to any viewport edge via the `position` variant,
 * which sets the anchor, the panel's dimensions, the rounded corners (the edge
 * it's flush against stays square), the shadow direction, and the slide
 * animation. `size` feeds `--panel-width` and `--panel-height`; `position`
 * maps the width to `maxWidth` (left/right) or the height to `maxHeight`
 * (top/bottom), since a top/bottom sheet reads best much shorter than a
 * left/right drawer is wide.
 */
export const styles = sva({
  className: "drawer",
  slots: drawerAnatomy.extendWith("stackRoot").keys(),
  base: {
    stackRoot: {
      display: "contents",
    },
    positioner: {
      display: "flex",
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
      outline: "none",
      backgroundColor: "neutral.s10",
      padding: "1",
      transition: "[transform 0.2s ease, translate 0.15s ease]",
      _open: {
        animationDuration: "normal",
      },
      _closed: {
        animationDuration: "fast",
      },
    },
  },
  variants: {
    size: {
      sm: {
        content: {
          "--panel-width": "520px",
          "--panel-height": "280px",
          "--panel-horizontal-padding": "var(--spacing-4)",
          "--panel-top-padding": "var(--spacing-3\\.5)",
          "--panel-close-button-gap": "var(--spacing-2\\.5)",
        },
      },
      md: {
        content: { "--panel-width": "640px", "--panel-height": "400px" },
      },
      lg: {
        content: { "--panel-width": "860px", "--panel-height": "560px" },
      },
      xl: {
        content: { "--panel-width": "1060px", "--panel-height": "720px" },
      },
    },
    position: {
      right: {
        positioner: {
          justifyContent: "flex-end",
          alignItems: "stretch",
          paddingLeft: "[10%]",
        },
        content: {
          height: "[100dvh]",
          maxWidth: "[var(--panel-width)]",
          borderTopLeftRadius: "xl",
          borderBottomLeftRadius: "xl",
          borderTopRightRadius: "[0]",
          borderBottomRightRadius: "[0]",
          boxShadow:
            "[-1px 0 0 0 rgba(0, 0, 0, 0.03), -1px 0 2px -1px rgba(0, 0, 0, 0.06), -8px 0 16px -6px rgba(0, 0, 0, 0.09), -18px 0 32px -14px rgba(0, 0, 0, 0.16)]",
          _open: { animationName: "drawerSlideInRight" },
          _closed: { animationName: "drawerSlideOutRight" },
        },
      },
      left: {
        positioner: {
          justifyContent: "flex-start",
          alignItems: "stretch",
          paddingRight: "[10%]",
        },
        content: {
          height: "[100dvh]",
          maxWidth: "[var(--panel-width)]",
          borderTopRightRadius: "xl",
          borderBottomRightRadius: "xl",
          borderTopLeftRadius: "[0]",
          borderBottomLeftRadius: "[0]",
          boxShadow:
            "[1px 0 0 0 rgba(0, 0, 0, 0.03), 1px 0 2px -1px rgba(0, 0, 0, 0.06), 8px 0 16px -6px rgba(0, 0, 0, 0.09), 18px 0 32px -14px rgba(0, 0, 0, 0.16)]",
          _open: { animationName: "drawerSlideInLeft" },
          _closed: { animationName: "drawerSlideOutLeft" },
        },
      },
      top: {
        positioner: {
          flexDirection: "column",
          justifyContent: "flex-start",
          alignItems: "stretch",
          paddingBottom: "[10%]",
        },
        content: {
          height: "[100%]",
          maxHeight: "[var(--panel-height)]",
          borderBottomLeftRadius: "xl",
          borderBottomRightRadius: "xl",
          borderTopLeftRadius: "[0]",
          borderTopRightRadius: "[0]",
          boxShadow:
            "[0 1px 0 0 rgba(0, 0, 0, 0.03), 0 1px 2px -1px rgba(0, 0, 0, 0.06), 0 8px 16px -6px rgba(0, 0, 0, 0.09), 0 18px 32px -14px rgba(0, 0, 0, 0.16)]",
          _open: { animationName: "drawerSlideInTop" },
          _closed: { animationName: "drawerSlideOutTop" },
        },
      },
      bottom: {
        positioner: {
          flexDirection: "column",
          justifyContent: "flex-end",
          alignItems: "stretch",
          paddingTop: "[10%]",
        },
        content: {
          height: "[100%]",
          maxHeight: "[var(--panel-height)]",
          borderTopLeftRadius: "xl",
          borderTopRightRadius: "xl",
          borderBottomLeftRadius: "[0]",
          borderBottomRightRadius: "[0]",
          boxShadow:
            "[0 -1px 0 0 rgba(0, 0, 0, 0.03), 0 -1px 2px -1px rgba(0, 0, 0, 0.06), 0 -8px 16px -6px rgba(0, 0, 0, 0.09), 0 -18px 32px -14px rgba(0, 0, 0, 0.16)]",
          _open: { animationName: "drawerSlideInBottom" },
          _closed: { animationName: "drawerSlideOutBottom" },
        },
      },
    },
  },
  defaultVariants: {
    size: "md",
    position: "right",
  },
});
