import { useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { EntityRows } from "./run-value/entity-rows";

import type { ValueDisplay } from "./run-value-display";

/** How many of a list's values show at first, and how many more each time more are asked for. */
const firstCount = 10;
const moreCount = 50;

const values = css({ display: "flex", flexDirection: "column", gap: "1" });
const inlineValue = css({
  m: "0",
  textStyle: "sm",
  color: "fg.heading",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});
const quiet = css({ textStyle: "sm", color: "fg.subtle" });
const showMore = css({ alignSelf: "flex-start" });

/** A value a step got or gave: text as it is, entities and files as rows, and anything else by what it is. */
export const RunValue = ({ display }: { display: ValueDisplay }) => {
  const [shownCount, setShownCount] = useState(firstCount);

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

  const shown = Math.min(count, shownCount);
  /* Entities load a batch at a time, so those already shown stay as they are when more are asked for. */
  const entityBatchStarts = [0];

  for (let start = firstCount; start < shown; start += moreCount) {
    entityBatchStarts.push(start);
  }

  return (
    <div className={values}>
      {display.kind === "inline"
        ? display.values.slice(0, shown).map((value, index) => (
            // Values can repeat, and are only ever shown in this order.
            // eslint-disable-next-line react/no-array-index-key
            <p key={index} className={value === "" ? quiet : inlineValue}>
              {value === "" ? "Empty" : value}
            </p>
          ))
        : entityBatchStarts.map((start, index) => (
            <EntityRows
              key={start}
              entityIds={display.entityIds.slice(
                start,
                entityBatchStarts[index + 1] ?? shown,
              )}
            />
          ))}
      {shown < count && (
        <Button
          variant="ghost"
          size="xs"
          className={showMore}
          onClick={() => setShownCount(shown + moreCount)}
        >
          Show {Math.min(moreCount, count - shown)} more of {count}
        </Button>
      )}
    </div>
  );
};
