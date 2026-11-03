import { Heading } from "@fumadocs/base-ui/components/heading";

import { Facts } from "./facts.js";
import * as Kinds from "./kinds.js";
import * as Slots from "./slots.js";

import type * as Components from "../../lib/components.js";
import type { ReactNode } from "react";

/** The namespaces an entry's export is in, from its anchor, which starts with their names when there are any. */
const ownerOf = (name: string, title: string): string => {
  if (!name.endsWith(`.${title}`)) {
    return "";
  }

  return name.slice(0, name.length - title.length);
};

/** An entry, headed by its declaration's keyword and its name after the namespaces it is in, which it draws quieter. */
export function ApiExport({
  name,
  title,
  kind,
  depth,
  since,
  stability,
  source,
  children,
}: Components.ExportProps): ReactNode {
  const keyword = Kinds.keywordOf(kind);
  const owner = ownerOf(name, title);
  const { slot: header, rest: body } = Slots.slotted(children, "header");

  return (
    <section className="api-export" data-depth={depth} data-kind={kind}>
      <div className="api-export-header">
        <Heading as={depth === 0 ? "h3" : "h4"} id={name}>
          {keyword === "" ? null : (
            <span className="api-keyword" data-kind={kind}>
              {`${keyword} `}
            </span>
          )}
          <span className="api-owner">{owner}</span>
          {title}
        </Heading>
        <div className="api-export-tools">
          {header}
          <Facts since={since} stability={stability} source={source} />
        </div>
      </div>
      <div className="api-export-body">{body}</div>
    </section>
  );
}
