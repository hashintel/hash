import { List } from "./list.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

export function ApiParameters({
  children,
}: Components.ChildrenProps): ReactNode {
  return <List title="Parameters">{children}</List>;
}
