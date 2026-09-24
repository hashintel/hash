import { useState } from "react";

import {
  Petricon,
  type PetriconName,
  type PetriconProps,
  type PetriconEffect,
} from "@hashintel/petrinaut/ui";

export const getGlyphState = (
  name: PetriconName,
  step: number,
): Partial<
  Pick<
    PetriconProps,
    "status" | "collapsed" | "open" | "muted" | "playing" | "selected"
  >
> => {
  const active = step % 2 === 1;
  switch (name) {
    case "diagnostics":
      return {
        status: step % 3 === 0 ? "valid" : step % 3 === 1 ? "error" : "warning",
      };
    case "sidebar":
      return { collapsed: active };
    case "settings":
    case "menu":
      return { open: active };
    case "microphone":
      return { muted: active };
    case "playback":
      return { playing: active };
    default:
      return { selected: active };
  }
};

export const statefulGlyphs = new Set<PetriconName>([
  "diagnostics",
  "sidebar",
  "settings",
  "menu",
  "microphone",
  "playback",
  "shapes",
  "flask",
  "layer",
  "addPlace",
  "addTransition",
]);

export const GlyphDemo = ({
  name,
  label,
  size = 64,
  effect = "action",
}: {
  name: PetriconName;
  label: string;
  size?: number;
  effect?: PetriconEffect;
}) => {
  const [step, setStep] = useState(0);
  return (
    <button
      type="button"
      className="petricon-glyph-demo"
      aria-label={`Animate ${label}`}
      onClick={() => setStep(step + 1)}
    >
      <Petricon
        name={name}
        size={size}
        duration={effect === "draw" ? 720 : 400}
        {...getGlyphState(name, step)}
        effect={
          statefulGlyphs.has(name) && effect === "action" ? undefined : effect
        }
        trigger={step}
      />
      <span>
        {label}
        <span aria-hidden="true">↗</span>
      </span>
    </button>
  );
};
