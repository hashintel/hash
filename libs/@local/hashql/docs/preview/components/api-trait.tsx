import { Header } from "./header.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

const declarationLabel = "Declaration";

/** A trait, headed like an entry, with a link to the declaration it is when the reference documents it. */
export function ApiTrait({
  name,
  title,
  declaration,
  children,
}: Components.TraitProps): ReactNode {
  return (
    <section className="api-export" data-depth={0} data-kind="trait">
      <Header id={name} kind="trait" owner="" name={title}>
        {declaration === undefined ? null : (
          <a className="api-declaration-link" href={declaration}>
            {declarationLabel}
          </a>
        )}
      </Header>
      <div className="api-export-body">{children}</div>
    </section>
  );
}
