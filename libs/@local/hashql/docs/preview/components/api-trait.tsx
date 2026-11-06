import { Header } from "./header.js";
import * as Slots from "./slots.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** A trait, headed like an entry, with its type hierarchy on its heading's line. */
export function ApiTrait({
  name,
  title,
  children,
}: Components.TraitProps): ReactNode {
  const { slot: tools, rest: body } = Slots.slotted(children, "header");

  return (
    <section className="api-export" data-depth={0} data-kind="trait">
      <Header id={name} kind="trait" owner="" name={title}>
        {tools}
      </Header>
      <div className="api-export-body">{body}</div>
    </section>
  );
}
