import { Facts } from "./facts.js";
import { Overloads } from "./overloads.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** One declaration's code, after the numbers of the overloads it declares and its own comment's facts, which a declaration of a single overload leaves to its entry. A deprecated declaration strikes its code through. */
export function ApiSignature({
  overloads,
  since,
  stability,
  source,
  internal,
  deprecated,
  children,
}: Components.SignatureProps): ReactNode {
  return (
    <div
      className="api-signature"
      data-deprecated={deprecated === true ? "" : undefined}
    >
      <div className="api-signature-header">
        <Overloads numbers={overloads} />
        <Facts
          since={since}
          stability={stability}
          source={source}
          internal={internal}
        />
      </div>
      {children}
    </div>
  );
}
