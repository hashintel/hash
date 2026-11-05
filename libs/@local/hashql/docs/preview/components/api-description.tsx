import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** What a comment says before its tags. */
export function ApiDescription({
  children,
}: Components.ChildrenProps): ReactNode {
  return <div className="api-description">{children}</div>;
}
