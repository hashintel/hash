import * as Colours from "./colours.js";
import { Glyph } from "./glyph.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** A row with the kind's glyph, then the name in the colour the themes give that kind of name in code, then the first sentence. */
export function ApiRow({
  href,
  kind,
  depth,
  names,
  summary,
  deprecated,
}: Components.RowProps): ReactNode {
  const colours = Colours.coloursOf(kind);
  const title = names.join(".");

  return (
    <li
      className="api-index-row"
      data-depth={depth}
      data-kind={kind}
      data-search={`${title} ${summary}`.toLowerCase()}
    >
      <a href={href} title={summary}>
        <Glyph kind={kind} />
        <code
          className="api-index-name"
          data-coloured={colours === undefined ? undefined : ""}
          data-deprecated={deprecated === true ? "" : undefined}
          style={colours}
        >
          {title}
        </code>
        {summary === "" ? null : (
          <span className="api-index-summary">{summary}</span>
        )}
      </a>
    </li>
  );
}
