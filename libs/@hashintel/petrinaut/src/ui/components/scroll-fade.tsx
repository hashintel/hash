import { css } from "@hashintel/ds-helpers/css";

import type { CSSProperties } from "react";

const fadeStyle = css({
  position: "absolute",
  left: "[0]",
  right: "[0]",
  pointerEvents: "none",
  zIndex: "[3]",
  "&[data-animated]": {
    transition: "[opacity 150ms ease]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
});

const layerStyle = css({
  position: "absolute",
  inset: "[0]",
});

export const ScrollFade: React.FC<{
  edge: "top" | "bottom";
  visible: boolean;
  size?: number;
  blur?: number;
  offset?: CSSProperties["top"];
  color?: string;
  animated?: boolean;
}> = ({
  edge,
  visible,
  size = 16,
  blur = 0,
  offset = 0,
  color = "var(--colors-neutral-s00)",
  animated = true,
}) => (
  <div
    aria-hidden="true"
    data-scroll-fade={edge}
    data-animated={animated || undefined}
    className={fadeStyle}
    style={{
      [edge]: offset,
      height: size,
      opacity: visible ? 1 : 0,
    }}
  >
    {blur > 0
      ? [0.25, 0.5, 1].map((strength) => (
          <span
            key={strength}
            className={layerStyle}
            style={{
              backdropFilter: `blur(${blur * strength}px)`,
              maskImage: `linear-gradient(to ${edge === "top" ? "bottom" : "top"}, black, transparent ${100 - strength * 35}%)`,
            }}
          />
        ))
      : null}
    <span
      className={layerStyle}
      style={{
        background: `linear-gradient(to ${edge === "top" ? "bottom" : "top"}, ${color}, color-mix(in srgb, ${color} 75%, transparent) 25%, color-mix(in srgb, ${color} 25%, transparent) 60%, transparent)`,
      }}
    />
  </div>
);
