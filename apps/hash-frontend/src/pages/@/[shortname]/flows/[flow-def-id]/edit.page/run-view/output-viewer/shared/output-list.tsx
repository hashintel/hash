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

const stack = css({ display: "flex", flexDirection: "column", gap: "3" });
const tabCount = css({ color: "fg.subtle" });
const loading = css({ display: "flex", justifyContent: "center", py: "6" });
const tableScroll = css({ overflowX: "auto" });
/* Names line up with the text above the table. */
const table = css({ "& th:first-child, & td:first-child": { pl: "0" } });
/* A long value, e.g. a description, shows its start, and the rest on hover. */
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

/** Files, and entities that couldn't be loaded, as rows; any other entities as a table. */
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
  const allFiles = groupEntities.every(isFileEntity);

  if (!closedType || !entities.definitions || allFiles) {
    return (
      <EntityRows
        entities={{ ...entities, entities: groupEntities }}
        /* Only files open: an entity that couldn't be loaded has nothing more to show. */
        onOpen={
          allFiles
            ? (position) => {
                const index = group.indexes[position];

                if (index !== undefined) {
                  onOpenFile(index);
                }
              }
            : undefined
        }
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

/** A list a run got or gave, whole, with a tab per type when its entities are of several. */
export const OutputList = ({
  list,
  entities,
  typeKey,
  onPickType,
  onOpenFile,
}: {
  list: ListDisplay;
  entities: RunEntities;
  /** The type tab picked, else the first. */
  typeKey: string | undefined;
  onPickType: (typeKey: string) => void;
  /** Opens the file at this position in the list. */
  onOpenFile: (index: number) => void;
}) => {
  if (list.kind === "inline") {
    return (
      <div className={stack}>
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
  const picked = typeGroups.find(({ key }) => key === typeKey) ?? typeGroups[0];

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
    <div className={stack}>
      <Tabs value={picked.key} onChange={onPickType} variant="pill" size="sm">
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
