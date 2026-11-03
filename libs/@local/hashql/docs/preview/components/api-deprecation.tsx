import type * as Components from "../../lib/components.js";
import type { ReactNode } from "react";

const label = "Deprecated";

/** The notice at the top of a deprecated export's description, with what its `@deprecated` says after the word "Deprecated". */
export function ApiDeprecation({
  children,
}: Components.DeprecationProps): ReactNode {
  return (
    <div className="api-deprecation" role="note">
      <span className="api-deprecation-label">{label}</span>
      {children}
    </div>
  );
}
