import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** Every declaration of an entry or a member as one panel, under a title that counts the overloads when there is more than one. */
export function ApiSignatures({
  overloads,
  children,
}: Components.SignaturesProps): ReactNode {
  const title =
    overloads > 1 ? `Signatures · ${overloads} overloads` : "Signature";

  return (
    <div className="api-part" data-part="declaration">
      <h4 className="api-section-title">{title}</h4>
      <div className="api-signatures" data-overloads={overloads}>
        {children}
      </div>
    </div>
  );
}
