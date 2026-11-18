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
import { getListPeek } from "../../shared/run-value-display";
import { ShowAllButton } from "../../shared/show-all-button";
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
/* A tab's label, not its pill, starts at the title's x. */
const tabList = css({ ml: "-2" });
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

/** A peek, files, and entities that couldn't be loaded, as rows; any other entities as a table. */
const GroupBody = ({
  group,
  entities,
  peek,
  onOpenFile,
}: {
  group: EntityGroup;
  entities: RunEntities;
  /** How many of the first to show, as rows; without it, all of them. */
  peek: number | undefined;
  onOpenFile: (index: number) => void;
}) => {
  const indexes = group.indexes.slice(0, peek);
  const groupEntities = indexes.map((index) => entities.entities[index]);
  const closedType =
    group.entityTypeIds && entities.typesMap
      ? getClosedMultiEntityTypeFromMap(entities.typesMap, group.entityTypeIds)
      : null;
  const allFiles = groupEntities.every(isFileEntity);

  if (peek !== undefined || !closedType || !entities.definitions || allFiles) {
    return (
      <EntityRows
        entities={{ ...entities, entities: groupEntities }}
        /* Only files open: other entities show whole in their table, and one that couldn't be loaded has nothing to show. */
        onOpen={
          allFiles
            ? (position) => {
                const index = indexes[position];

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

/** A list a run got or gave, with a tab per type when its entities are of several. */
export const OutputList = ({
  list,
  entities,
  typeKey,
  onPickType,
  onOpenFile,
  onShowAll,
}: {
  list: ListDisplay;
  entities: RunEntities;
  /** The type tab picked, else the first. */
  typeKey: string | undefined;
  onPickType: (typeKey: string) => void;
  /** Opens the file at this position in the list. */
  onOpenFile: (index: number) => void;
  /**
   * Shows only the first values, or the picked type's first entities as rows, then "Show all N", which calls this.
   * Without it, the list shows whole.
   */
  onShowAll?: () => void;
}) => {
  if (list.kind === "inline") {
    const peek = getListPeek(list.values.length);

    return (
      <div className={stack}>
        {(onShowAll ? list.values.slice(0, peek.shown) : list.values).map(
          (value, index) => (
            // Values can repeat, and are only ever shown in this order.
            // eslint-disable-next-line react/no-array-index-key
            <TextValue key={index} text={value} />
          ),
        )}
        {onShowAll && peek.showAll !== null && (
          <ShowAllButton count={peek.showAll} onClick={onShowAll} />
        )}
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

  const getLabel = (group: EntityGroup) =>
    group.entityTypeIds && entities.typesMap
      ? getGroupLabel(
          getClosedMultiEntityTypeFromMap(
            entities.typesMap,
            group.entityTypeIds,
          ),
        )
      : undefined;
  const peek = getListPeek(picked.indexes.length);

  return (
    <div className={stack}>
      {typeGroups.length > 1 && (
        <Tabs value={picked.key} onChange={onPickType} variant="pill" size="sm">
          <Tabs.TabList
            className={tabList}
            items={typeGroups.map((group) => ({
              id: group.key,
              children: (
                <>
                  {getLabel(group) ?? "Not found"}
                  <span className={tabCount}>{group.indexes.length}</span>
                </>
              ),
            }))}
          />
        </Tabs>
      )}
      <GroupBody
        key={picked.key}
        group={picked}
        entities={entities}
        peek={onShowAll ? peek.shown : undefined}
        onOpenFile={onOpenFile}
      />
      {onShowAll && peek.showAll !== null && (
        <ShowAllButton
          count={peek.showAll}
          noun={getLabel(picked)}
          onClick={onShowAll}
        />
      )}
    </div>
  );
};
