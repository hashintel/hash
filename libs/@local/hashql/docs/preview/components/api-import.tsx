import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** The statement that imports a module, under its comment. */
export function ApiImport({ children }: Components.ChildrenProps): ReactNode {
  return <div className="api-import">{children}</div>;
}
