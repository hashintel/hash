import { Heading } from "@fumadocs/base-ui/components/heading";

import * as Kinds from "./kinds.js";

import type { ReactNode } from "react";

/** An entry's heading, which reads like code and draws the namespaces the entry is in quieter than its name. */
export function Header({
  id,
  kind,
  owner,
  name,
  deprecated,
  children,
}: {
  readonly id: string;
  readonly kind: string;
  /** The namespaces the entry is in, joined with `.`, or empty at a page's top level. */
  readonly owner: string;
  readonly name: string;
  readonly deprecated?: boolean | undefined;
  readonly children?: ReactNode;
}): ReactNode {
  const keyword = Kinds.keywordOf(kind);

  return (
    <div className="api-export-header">
      <Heading as={owner === "" ? "h3" : "h4"} id={id}>
        {keyword === "" ? null : (
          <span className="api-keyword" data-kind={kind}>
            {`${keyword} `}
          </span>
        )}
        {owner === "" ? null : <span className="api-owner">{`${owner}.`}</span>}
        <span
          className="api-name"
          data-deprecated={deprecated === true ? "" : undefined}
        >
          {name}
        </span>
      </Heading>
      <div className="api-export-tools">{children}</div>
    </div>
  );
}
