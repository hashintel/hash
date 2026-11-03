import * as Kinds from "./kinds.js";

import type { ReactNode } from "react";

/** A kind, drawn as a letter in a small square. */
export function Glyph({ kind }: { readonly kind: string }): ReactNode {
  return (
    <span className="api-glyph" data-kind={kind} title={kind} aria-hidden>
      {Kinds.letters[kind] ?? "?"}
    </span>
  );
}
