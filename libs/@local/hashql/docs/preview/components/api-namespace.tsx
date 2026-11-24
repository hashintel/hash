import { Facts } from "./facts.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

const keyword = "namespace ";

/** A namespace merged with an entry, under its name on a rule, with its exports indented below. */
export function ApiNamespace({
  title,
  since,
  stability,
  source,
  internal,
  children,
}: Components.NamespaceProps): ReactNode {
  return (
    <div className="api-part" data-part="namespace">
      <div className="api-section" data-keyword="namespace">
        <div className="api-section-header">
          <h4 className="api-section-title">
            <span className="api-keyword" data-kind="namespace">
              {keyword}
            </span>
            {title}
          </h4>
          <div className="api-section-tools">
            <Facts
              since={since}
              stability={stability}
              source={source}
              internal={internal}
            />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
