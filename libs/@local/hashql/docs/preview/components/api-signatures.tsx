import { Children } from "react";

import { Overloads } from "./overloads.js";

import type * as Components from "../../lib/components.js";
import type { ReactNode } from "react";

/** The overloads of one export as one panel, each numbered from 1, with a rule between overloads. */
export function ApiSignatures({
  children,
}: Components.SignaturesProps): ReactNode {
  return (
    <div className="api-signatures">
      {/* oxlint-disable-next-line react/no-react-children -- the children are the code blocks of the overloads, in order, which the extraction writes */}
      {Children.toArray(children).map((signature, index) => (
        <div className="api-signature" key={`${index + 1}`}>
          <Overloads numbers={`${index + 1}`} />
          {signature}
        </div>
      ))}
    </div>
  );
}
