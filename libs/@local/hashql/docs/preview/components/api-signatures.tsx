import { Section } from "./section.js";
import * as Slots from "./slots.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** Every declaration of an entry or a member under a title that counts them when there is more than one, as overloads or as declarations, with the entry's type hierarchy on the title's line. More than one declaration shares a panel. */
export function ApiSignatures({
  overloads,
  counted,
  children,
}: Components.SignaturesProps): ReactNode {
  const { slot: tools, rest: signatures } = Slots.slotted(children, "title");
  const title =
    overloads > 1 ? `Signatures · ${overloads} ${counted}` : "Signature";

  return (
    <div className="api-part" data-part="declaration">
      <Section title={title} tools={tools.length === 0 ? undefined : tools}>
        {signatures.length > 1 ? (
          <div className="api-signatures">{signatures}</div>
        ) : (
          signatures
        )}
      </Section>
    </div>
  );
}
