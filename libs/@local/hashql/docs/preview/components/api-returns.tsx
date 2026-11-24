import { List } from "./list.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** What the calls return, as one item without a name. */
export function ApiReturns({ children }: Components.ChildrenProps): ReactNode {
  return (
    <List title="Returns">
      <div className="api-item">{children}</div>
    </List>
  );
}
