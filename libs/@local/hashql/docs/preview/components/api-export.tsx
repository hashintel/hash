import { Facts } from "./facts.js";
import { Header } from "./header.js";
import * as Slots from "./slots.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** An entry, headed by its declaration, with its parts below. The type hierarchy of an entry without declarations sits on its heading's line. */
export function ApiExport({
  name,
  title,
  names,
  kind,
  since,
  stability,
  source,
  internal,
  deprecated,
  children,
}: Components.ExportProps): ReactNode {
  const owner = names.slice(0, -1).join(".");
  const { slot: tools, rest: body } = Slots.slotted(children, "header");

  return (
    <section
      className="api-export"
      data-depth={Math.max(names.length - 1, 0)}
      data-kind={kind}
    >
      <Header
        id={name}
        kind={kind}
        owner={owner}
        name={names.at(-1) ?? title}
        deprecated={deprecated}
      >
        {tools}
        <Facts
          since={since}
          stability={stability}
          source={source}
          internal={internal}
        />
      </Header>
      <div className="api-export-body">{body}</div>
    </section>
  );
}
