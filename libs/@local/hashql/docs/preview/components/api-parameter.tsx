import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** A parameter, named as a declaration writes it: `...` before a rest parameter and `?` after an optional one. */
export function ApiParameter({
  name,
  optional,
  rest,
  children,
}: Components.ParameterProps): ReactNode {
  return (
    <div className="api-item">
      <span className="api-item-name">
        {rest === true ? "..." : null}
        {name}
        {optional === true ? "?" : null}
      </span>
      {children}
    </div>
  );
}
