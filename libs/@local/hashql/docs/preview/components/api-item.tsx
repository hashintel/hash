import { isValidElement } from "react";

import * as Slots from "./slots.js";

import type * as Components from "../../lib/components.js";
import type { ReactNode } from "react";

const separator = ": ";

/** Whether `terms` are one type that holds in every overload, which follows the name as a declaration writes it. */
const isWhole = (terms: readonly ReactNode[]): boolean => {
  const [only] = terms;

  return (
    terms.length === 1 &&
    isValidElement<Components.TermProps>(only) &&
    only.props.overloads === ""
  );
};

/** An item of a list, with its name and its types on one line over its description. */
export function ApiItem({ name, children }: Components.ItemProps): ReactNode {
  const { slot: terms, rest } = Slots.slotted(children, "term");
  const whole = name !== "" && isWhole(terms);

  return (
    <div className="api-item">
      <div className="api-item-term" data-whole={whole ? "" : undefined}>
        {name === "" ? null : (
          <span className="api-item-name">
            {name}
            {whole ? separator : null}
          </span>
        )}
        {terms}
      </div>
      {rest.length === 0 ? null : (
        <div className="api-item-description">{rest}</div>
      )}
    </div>
  );
}
