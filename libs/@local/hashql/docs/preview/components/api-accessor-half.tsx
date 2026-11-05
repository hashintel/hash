import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** An accessor's getter or setter, each its own line of code. */
export function ApiAccessorHalf({
  children,
}: Components.ChildrenProps): ReactNode {
  return <div className="api-accessor-half">{children}</div>;
}
