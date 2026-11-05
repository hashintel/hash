import { Facts } from "./facts.js";
import { Header } from "./header.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** An entry, headed by its declaration, with its parts below. */
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
        <Facts
          since={since}
          stability={stability}
          source={source}
          internal={internal}
        />
      </Header>
      <div className="api-export-body">{children}</div>
    </section>
  );
}
