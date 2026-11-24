import { css } from "@hashintel/ds-helpers/css";

/**
 * A bar centred over the bottom of the preview's canvas. An opaque bordered
 * box with no shadow, like the editor's panels, but rounded: it floats over
 * the canvas rather than framing the embed, and `lg` is the `md` of the
 * controls it wraps plus the padding around them.
 */
export const floatingBarStyle = css({
  position: "absolute",
  left: "[50%]",
  bottom: "2",
  zIndex: "[calc(var(--z-index-sticky) + 1)]",
  transform: "translateX(-50%)",
  padding: "0.5",
  overflow: "hidden",
  borderWidth: "thin",
  borderColor: "neutral.s40",
  borderRadius: "lg",
  backgroundColor: "neutral.s00",
});
