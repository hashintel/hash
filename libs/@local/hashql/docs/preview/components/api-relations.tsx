import type * as Components from "../../lib/components.js";
import type { ReactNode } from "react";

/** An export's relations, each a group of rows. */
export function ApiRelations({
  children,
}: Components.RelationsProps): ReactNode {
  return <div className="api-relations not-prose">{children}</div>;
}
