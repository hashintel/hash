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

export const KeycapLegend = ({
  text,
  kind = "character",
}: {
  text: string;
  kind?: "character" | "function" | "word";
}) => {
  const glyphs = Array.from(
    text,
    (character) => keycapGlyphs[character as keyof typeof keycapGlyphs],
  );
  const scale = { character: 1, function: 0.6, word: 0.45 }[kind];
  const tracking = 2.3;
  const width =
    glyphs.reduce((total, glyph) => total + glyph.width, 0) +
    (glyphs.length - 1) * tracking;
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
        offset += glyph.width + tracking;
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
