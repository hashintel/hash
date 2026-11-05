import { Overloads } from "./overloads.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** One declaration's code, numbered in its margin when its entry has more than one. A deprecated declaration strikes its code through. */
export function ApiSignature({
  overloads,
  deprecated,
  children,
}: Components.SignatureProps): ReactNode {
  return (
    <div
      className="api-signature"
      data-deprecated={deprecated === true ? "" : undefined}
    >
      {overloads === undefined ? null : <Overloads numbers={overloads} />}
      {children}
    </div>
  );
}
