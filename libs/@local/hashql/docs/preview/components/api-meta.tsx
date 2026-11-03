import { Facts } from "./facts.js";
import { Glyph } from "./glyph.js";

import type * as Components from "../../lib/components.js";
import type { ReactNode } from "react";

/** The facts under a module's or an entrypoint's title, which start with what it is and how many exports it has. */
export function ApiMeta({
  kind,
  exports,
  since,
  stability,
  source,
  internal,
}: Components.MetaProps): ReactNode {
  return (
    <div className="api-meta not-prose">
      <span className="api-meta-kind">
        <Glyph kind={kind} />
        {kind}
      </span>
      {exports > 0 ? <span>{`${exports} exports`}</span> : null}
      <Facts
        since={since}
        stability={stability}
        source={source}
        internal={internal}
        labelled
      />
    </div>
  );
}
