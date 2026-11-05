import { List } from "./list.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

export function ApiTypeParameters({
  children,
}: Components.ChildrenProps): ReactNode {
  return <List title="Type parameters">{children}</List>;
}
