import { EveryOverload } from "./every-overload.js";
import { Overloads } from "./overloads.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** An error the calls throw, after the overloads that throw it: their numbers, or the mark of every overload in a list where another error has numbers. */
export function ApiThrow({
  overloads,
  every,
  children,
}: Components.ThrowProps): ReactNode {
  return (
    <div className="api-item">
      {overloads === undefined ? null : <Overloads numbers={overloads} />}
      {every === true ? <EveryOverload /> : null}
      {children}
    </div>
  );
}
