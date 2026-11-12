import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { EntityRows } from "../shared/entity-rows";
import { isFileEntity, useRunEntities } from "../shared/run-entities";
import { getListPeek } from "../shared/run-value-display";
import { TextValue } from "../shared/text-value";

import type { ListDisplay, ValueDisplay } from "../shared/run-value-display";
import type { OutputContent } from "../use-output-viewer";

const values = css({ display: "flex", flexDirection: "column", gap: "1" });
const quiet = css({ textStyle: "sm", color: "fg.subtle" });
const showAll = css({ alignSelf: "flex-start" });

/** A list's first entities, a row each: a file opens on its own, and any other entity opens the whole list. */
const EntityPeek = ({
  list,
  shown,
  onOpen,
}: {
  list: Extract<ListDisplay, { kind: "entities" }>;
  shown: number;
  onOpen: (content: OutputContent) => void;
}) => {
  const entities = useRunEntities(list.entityIds.slice(0, shown));

  return (
    <EntityRows
      entities={entities}
      onOpen={(index) =>
        onOpen(
          isFileEntity(entities.entities[index])
            ? { kind: "file", entityIds: list.entityIds, index }
            : { kind: "list", list },
        )
      }
    />
  );
};

/**
 * A value a step got or gave: text as it is, entities and files as rows that open them, and anything else by what it
 * is. A long list shows its first values, then "Show all N", which opens the whole list wide.
 */
export const RunValue = ({
  display,
  onOpen,
}: {
  display: ValueDisplay;
  onOpen: (content: OutputContent, options?: { wide: boolean }) => void;
}) => {
  if (display.kind === "described") {
    return <span className={quiet}>{display.text}</span>;
  }

  const length =
    display.kind === "inline"
      ? display.values.length
      : display.entityIds.length;

  if (length === 0) {
    return <span className={quiet}>None</span>;
  }

  const peek = getListPeek(length);

  return (
    <div className={values}>
      {display.kind === "inline" ? (
        display.values.slice(0, peek.shown).map((value, index) => (
          // Values can repeat, and are only ever shown in this order.
          // eslint-disable-next-line react/no-array-index-key
          <TextValue key={index} text={value} />
        ))
      ) : (
        <EntityPeek list={display} shown={peek.shown} onOpen={onOpen} />
      )}
      {peek.showAll !== null && (
        <Button
          variant="ghost"
          size="xs"
          className={showAll}
          onClick={() =>
            onOpen({ kind: "list", list: display }, { wide: true })
          }
        >
          Show all {peek.showAll}
        </Button>
      )}
    </div>
  );
};
