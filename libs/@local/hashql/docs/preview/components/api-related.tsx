import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** An entry's relations, each a group of rows. */
export function ApiRelated({ children }: Components.ChildrenProps): ReactNode {
  return (
    <div className="api-part" data-part="references">
      <div className="api-relations not-prose">{children}</div>
    </div>
  );
}
