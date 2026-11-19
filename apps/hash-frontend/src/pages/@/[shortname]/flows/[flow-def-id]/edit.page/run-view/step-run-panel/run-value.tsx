import { css } from "@hashintel/ds-helpers/css";

import { EntityRows } from "../shared/entity-rows";
import {
  getTypeKey,
  isFileEntity,
  useRunEntities,
} from "../shared/run-entities";
import { getListLength, getListPeek } from "../shared/run-value-display";
import { ShowAllButton } from "../shared/show-all-button";
import { TextValue } from "../shared/text-value";

import type { ListDisplay, ValueDisplay } from "../shared/run-value-display";
import type { OutputContent } from "../shared/use-output-viewer";

const values = css({ display: "flex", flexDirection: "column", gap: "1" });
const quiet = css({ textStyle: "sm", color: "fg.subtle" });

/** A file opens on its own, and any other entity opens the whole list on its type. */
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
      onOpen={(index) => {
        const entity = entities.entities[index];

        /* Until it loads, whether it's a file, and so what it opens, isn't known. */
        if (!entity && entities.loading) {
          return;
        }

        onOpen(
          isFileEntity(entity)
            ? { kind: "file", entityIds: list.entityIds, index }
            : /* On the entity's type tab, so it's among those shown. */
              { kind: "list", list, typeKey: entity && getTypeKey(entity) },
        );
      }}
    />
  );
};

/** A value a step got or gave. A long list shows its first values, then "Show all N", which opens it wide. */
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

  const length = getListLength(display);

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
        <ShowAllButton
          count={peek.showAll}
          onClick={() =>
            onOpen({ kind: "list", list: display }, { wide: true })
          }
        />
      )}
    </div>
  );
};
