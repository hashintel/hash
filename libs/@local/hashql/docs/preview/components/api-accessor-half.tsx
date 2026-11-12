import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** An accessor's getter or setter: its line of code over its own documentation. */
export function ApiAccessorHalf({
  children,
}: Components.ChildrenProps): ReactNode {
  return <div className="api-accessor-half">{children}</div>;
}
