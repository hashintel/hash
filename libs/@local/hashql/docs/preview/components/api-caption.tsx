import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

export function ApiCaption({ children }: Components.ChildrenProps): ReactNode {
  return <div className="api-caption">{children}</div>;
}
