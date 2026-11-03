import type { PartProps } from "../../lib/components.js";
import type { ReactNode } from "react";

/** One part of an entry, a cell of the entry's grid. */
export function ApiPart({ name, children }: PartProps): ReactNode {
  return (
    <div className="api-part" data-part={name}>
      {children}
    </div>
  );
}
