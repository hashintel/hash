import { useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { EntityRows } from "./run-value/entity-rows";

import type { ValueDisplay } from "./value-display";

/** How many of a list's values show before the rest are asked for. */
const shownCount = 10;

const values = css({ display: "flex", flexDirection: "column", gap: "1" });
const inlineValue = css({
  m: "0",
  textStyle: "sm",
  color: "fg.heading",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});
const quiet = css({ textStyle: "sm", color: "fg.subtle" });
const showAll = css({ alignSelf: "flex-start" });

/** A value a step got or gave: text as it is, entities and files as rows, and anything else by what it is. */
export const RunValue = ({ display }: { display: ValueDisplay }) => {
  const [expanded, setExpanded] = useState(false);

  if (display.kind === "described") {
    return <span className={quiet}>{display.text}</span>;
  }

  const count =
    display.kind === "inline"
      ? display.values.length
      : display.entityIds.length;

  if (count === 0) {
    return <span className={quiet}>None</span>;
  }

  const shown = expanded ? count : Math.min(count, shownCount);

  return (
    <div className={values}>
      {display.kind === "inline" ? (
        display.values.slice(0, shown).map((value, index) => (
          // Values can repeat, and are only ever shown in this order.
          // eslint-disable-next-line react/no-array-index-key
          <p key={index} className={inlineValue}>
            {value}
          </p>
        ))
      ) : (
        <EntityRows entityIds={display.entityIds.slice(0, shown)} />
      )}
      {shown < count && (
        <Button
          variant="ghost"
          size="xs"
          className={showAll}
          onClick={() => setExpanded(true)}
        >
          Show all {count}
        </Button>
      )}
    </div>
  );
};
