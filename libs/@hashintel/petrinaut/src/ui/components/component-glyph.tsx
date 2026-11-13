import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { iconMaskImage } from "./component-glyph/icon-mask";

type IconProps = React.ComponentProps<typeof Icon>;

const maskedGlyphStyle = css({
  display: "inline-block",
  flexShrink: "0",
  backgroundColor: "[currentColor]",
});

/** The sizes the built-in icons take, so a component's own icon sits alike. */
const glyphSizes: Record<NonNullable<IconProps["size"]>, number> = {
  xxs: 8,
  xs: 12,
  sm: 16,
  md: 24,
  lg: 32,
};

/**
 * A component's glyph: its own icon when it has one that reads as SVG, else
 * the built-in `fallback`. The icon's shape is painted in the current text
 * colour through a CSS mask, so it follows the theme and the component's
 * colour, and its markup is only ever an image, never part of the page.
 */
export const ComponentGlyph: React.FC<{
  iconSvg: string | null | undefined;
  fallback: IconProps["name"];
  size?: IconProps["size"];
}> = ({ iconSvg, fallback, size = "md" }) => {
  const image = iconSvg ? iconMaskImage(iconSvg) : null;
  if (image === null) {
    return <Icon name={fallback} size={size} />;
  }
  const mask = `${image} center / contain no-repeat`;
  const side = glyphSizes[size];
  return (
    <span
      aria-hidden
      className={maskedGlyphStyle}
      style={{ width: side, height: side, mask, WebkitMask: mask }}
    />
  );
};
