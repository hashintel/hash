import { Overloads } from "./overloads.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** An error the calls throw, after the numbers of the overloads that throw it when not all of them do. */
export function ApiThrow({
  overloads,
  children,
}: Components.ThrowProps): ReactNode {
  return (
    <div className="api-item">
      {overloads === undefined ? null : <Overloads numbers={overloads} />}
      {children}
    </div>
  );
}
