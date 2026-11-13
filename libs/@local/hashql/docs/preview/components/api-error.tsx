import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

export function ApiError({ children }: Components.ChildrenProps): ReactNode {
  return <span className="api-error">{children}</span>;
}
