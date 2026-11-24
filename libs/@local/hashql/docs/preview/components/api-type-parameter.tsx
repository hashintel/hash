import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

export function ApiTypeParameter({
  name,
  children,
}: Components.TypeParameterProps): ReactNode {
  return (
    <div className="api-item">
      <span className="api-item-name">{name}</span>
      {children}
    </div>
  );
}
