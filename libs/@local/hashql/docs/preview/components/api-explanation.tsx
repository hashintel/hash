import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** The reference's own account of a trait. */
export function ApiExplanation({
  children,
}: Components.ExplanationProps): ReactNode {
  return (
    <div className="api-part api-description" data-part="description">
      {children}
    </div>
  );
}
