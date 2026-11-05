import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

const guideLabel = "Guide";

/** The reference's own account of a trait, then the guide a reader goes to for more. */
export function ApiExplanation({
  guide,
  children,
}: Components.ExplanationProps): ReactNode {
  return (
    <div className="api-part api-description" data-part="description">
      {children}
      {guide === undefined ? null : (
        <p>
          <a href={guide}>{guideLabel}</a>
        </p>
      )}
    </div>
  );
}
