import { coloursOf } from "./colours.js";
import { Glyph } from "./glyph.js";

import type { IndexRowProps } from "../../lib/components.js";
import type { ReactNode } from "react";

/** A row with the kind's glyph, then the name in the colour the themes give that kind of name in code, then the first sentence. */
export function ApiIndexRow({
  href,
  kind,
  depth,
  title,
  summary,
}: IndexRowProps): ReactNode {
  const colours = coloursOf(kind);

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
