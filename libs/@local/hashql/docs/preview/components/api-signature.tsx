import { Facts } from "./facts.js";
import { Overloads } from "./overloads.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** One declaration's code, numbered in its margin when its entry has more than one. The facts of its own that its entry's heading does not state sit at the end of its first line. A deprecated declaration strikes its code through. */
export function ApiSignature({
  overloads,
  since,
  stability,
  internal,
  source,
  deprecated,
  children,
}: Components.SignatureProps): ReactNode {
  const stated =
    since !== undefined ||
    stability !== undefined ||
    internal === true ||
    source !== undefined;

  return (
    <div
      className="api-signature"
      data-deprecated={deprecated === true ? "" : undefined}
    >
      {overloads === undefined ? null : <Overloads numbers={overloads} />}
      {stated ? (
        <Facts
          since={since}
          stability={stability}
          internal={internal}
          source={source}
        />
      ) : null}
      {children}
    </div>
  );
}
