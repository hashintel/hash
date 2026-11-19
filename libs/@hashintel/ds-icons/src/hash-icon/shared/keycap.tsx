import { FilledShape } from "../filled-shape";
import { keycapGlyphs } from "./keycap-glyphs";

import type { ReactNode } from "react";

export const Keycap = ({ children }: { children: ReactNode }) => (
  <g fill="none">
    <FilledShape cutout={children}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </FilledShape>
  </g>
);

export const KeycapLegend = ({ text }: { text: string }) => {
  const glyphs = Array.from(
    text,
    (character) => keycapGlyphs[character as keyof typeof keycapGlyphs],
  );
  const width =
    glyphs.reduce((total, glyph) => total + glyph.width, 0) +
    (glyphs.length - 1) * 2.3;
  const scale = Math.min(1, 12 / Math.max(width, 1));
  let offset = 0;
  return (
    <g
      transform={`translate(${12 - (width * scale) / 2} ${12 - 5 * scale}) scale(${scale})`}
      strokeWidth={`calc(var(--hash-icon-stroke-width) * ${0.65 / Math.sqrt(scale)})`}
      strokeLinecap="butt"
      strokeLinejoin="round"
    >
      {glyphs.map((glyph) => {
        const x = offset;
        offset += glyph.width + 2.3;
        return (
          <path
            key={x}
            transform={`translate(${x} 0)`}
            d={glyph.path}
            strokeLinecap={glyph.path.includes("h.01") ? "round" : undefined}
          />
        );
      })}
    </g>
  );
};
