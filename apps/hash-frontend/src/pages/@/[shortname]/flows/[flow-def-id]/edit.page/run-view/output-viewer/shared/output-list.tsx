import { useState } from "react";

import { Banner, LoadingSpinner, Tabs } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { getClosedMultiEntityTypeFromMap } from "@local/hash-graph-sdk/entity";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";

import { useGetOwnerForEntity } from "../../../../../../../../../components/hooks/use-get-owner-for-entity";
import { tableStyle } from "../../../shared/table";
import { EntityRows } from "../../shared/entity-rows";
import { isFileEntity } from "../../shared/run-entities";
import { TextValue } from "../../shared/text-value";
import {
  getGroupLabel,
  getPropertyColumns,
  groupByType,
} from "./output-list/entity-groups";

import type { RunEntities } from "../../shared/run-entities";
import type { ListDisplay } from "../../shared/run-value-display";
import type { EntityGroup } from "./output-list/entity-groups";
import type { ClosedMultiEntityType } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { ClosedMultiEntityTypesDefinitions } from "@local/hash-graph-sdk/ontology";

const values = css({ display: "flex", flexDirection: "column", gap: "3" });
const groups = css({ display: "flex", flexDirection: "column", gap: "3" });
const tabCount = css({ color: "fg.subtle", ml: "1.5" });
const loading = css({ display: "flex", justifyContent: "center", py: "6" });
/* A table wider than what it's in scrolls sideways. */
const tableScroll = css({ overflowX: "auto" });
/* Names line up with the text above the table. */
const table = css({ "& th:first-child, & td:first-child": { pl: "0" } });
/* Long values, e.g. a description, keep a column readable: their start shows, and the rest on hover. */
const cell = css({
  display: "block",
  maxWidth: "[280px]",
  overflow: "hidden",
  textOverflow: "ellipsis",
});
const nameLink = css({
  color: "fg.heading",
  fontWeight: "medium",
  textDecoration: "none",
  _hover: { textDecoration: "underline" },
});

/** Entities of one type as a table: each one's name, which opens its page, then the type's properties it has. */
const EntityTable = ({
  entities,
  closedType,
  definitions,
}: {
  entities: HashEntity[];
  closedType: ClosedMultiEntityType;
  definitions: ClosedMultiEntityTypesDefinitions;
}) => {
  const getOwnerForEntity = useGetOwnerForEntity();
  const columns = getPropertyColumns(closedType, definitions, entities);

  return (
    <div className={tableScroll}>
      <table className={cx(tableStyle, table)}>
        <thead>
          <tr>
            <th>Name</th>
            {columns.map(({ baseUrl, title }) => (
              <th key={baseUrl}>{title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entities.map((entity, index) => {
            const { entityId } = entity.metadata.recordId;
            const label = generateEntityLabel(closedType, entity);
            const { shortname } = getOwnerForEntity({ entityId });

            return (
              // A list can name the same entity twice, and is only ever shown in this order.
              // eslint-disable-next-line react/no-array-index-key
              <tr key={index}>
                <td>
                  {/* Its owner's shortname is empty until users and orgs have loaded. */}
                  <a
                    className={cx(cell, nameLink)}
                    href={
                      shortname
                        ? generateEntityPath({
                            shortname,
                            entityId,
                            includeDraftId: true,
                          })
                        : undefined
                    }
                    target="_blank"
                    rel="noreferrer"
                    title={label}
                  >
                    {label}
                  </a>
                </td>
                {columns.map(({ baseUrl }) => {
                  const text = stringifyPropertyValue(
                    entity.properties[baseUrl],
                  );

                  return (
                    <td key={baseUrl}>
                      <span className={cell} title={text}>
                        {text}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/** One type's entities: files, and those that couldn't be loaded, as rows; any other entities as a table. */
const GroupBody = ({
  group,
  entities,
  onOpenFile,
}: {
  group: EntityGroup;
  entities: RunEntities;
  onOpenFile: (index: number) => void;
}) => {
  const groupEntities = group.indexes.map((index) => entities.entities[index]);
  const closedType =
    group.entityTypeIds && entities.typesMap
      ? getClosedMultiEntityTypeFromMap(entities.typesMap, group.entityTypeIds)
      : null;

  if (
    !closedType ||
    !entities.definitions ||
    groupEntities.every(isFileEntity)
  ) {
    return (
      <EntityRows
        entities={{ ...entities, entities: groupEntities }}
        onOpen={(position) => {
          const index = group.indexes[position];

          if (index !== undefined && isFileEntity(entities.entities[index])) {
            onOpenFile(index);
          }
        }}
      />
    );
  }

  return (
    <EntityTable
      entities={groupEntities.filter((entity) => entity !== undefined)}
      closedType={closedType}
      definitions={entities.definitions}
    />
  );
};

/**
 * A list a run got or gave, whole: text a value a line, and entities a table per type, with a tab for each type when
 * there are several. Files show as rows, which open them.
 */
export const OutputList = ({
  list,
  entities,
  onOpenFile,
}: {
  list: ListDisplay;
  /** The list's entities, loaded. */
  entities: RunEntities;
  /** Opens the file at this position in the list. */
  onOpenFile: (index: number) => void;
}) => {
  const [pickedKey, setPickedKey] = useState<string | null>(null);

  if (list.kind === "inline") {
    return (
      <div className={values}>
        {list.values.map((value, index) => (
          // Values can repeat, and are only ever shown in this order.
          // eslint-disable-next-line react/no-array-index-key
          <TextValue key={index} text={value} />
        ))}
      </div>
    );
  }

  if (entities.loading && !entities.typesMap) {
    return (
      <div role="status" className={loading}>
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (entities.failed) {
    return (
      <Banner tone="error" role="status">
        <Banner.Title>Couldn't load these entities</Banner.Title>
      </Banner>
    );
  }

  const typeGroups = groupByType(entities.entities);
  const picked =
    typeGroups.find(({ key }) => key === pickedKey) ?? typeGroups[0];

  if (!picked) {
    return null;
  }

  const body = (
    <GroupBody
      key={picked.key}
      group={picked}
      entities={entities}
      onOpenFile={onOpenFile}
    />
  );

  if (typeGroups.length === 1) {
    return body;
  }

  return (
    <div className={groups}>
      <Tabs value={picked.key} onChange={setPickedKey} variant="pill" size="sm">
        <Tabs.TabList
          items={typeGroups.map((group) => ({
            id: group.key,
            children: (
              <>
                {group.entityTypeIds && entities.typesMap
                  ? getGroupLabel(
                      getClosedMultiEntityTypeFromMap(
                        entities.typesMap,
                        group.entityTypeIds,
                      ),
                    )
                  : "Not found"}
                <span className={tabCount}>{group.indexes.length}</span>
              </>
            ),
          }))}
        />
      </Tabs>
      {body}
    </div>
  );
};
