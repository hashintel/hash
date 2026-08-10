import { format } from "date-fns";

import {
  extractBaseUrl,
  extractVersion,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import {
  getClosedMultiEntityTypeFromMap,
  getDisplayFieldsForClosedEntityType,
} from "@local/hash-graph-sdk/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { includesPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import { gridHeaderBaseFont } from "../../../../components/grid/utils";

import type {
  EntitiesTableColumn,
  EntitiesTableColumnKey,
  EntitiesTableData,
  EntitiesTableRow,
  EntitiesTableRowPropertyCell,
  VisibleDataTypeIdsByPropertyBaseUrl,
} from "../entities-table-data";
import type {
  BaseUrl,
  ClosedMultiEntityType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  EntityTableLinkEndpoint,
  EntityTableRow as EndpointRow,
} from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesRootMap,
  EntityTypeResolveDefinitions,
} from "@local/hash-graph-sdk/ontology";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";

const staticColumnDefinitionsByKey: Record<
  Exclude<EntitiesTableColumnKey, "entityLabel">,
  EntitiesTableColumn
> = {
  entityTypes: {
    title: "Entity Type",
    id: "entityTypes",
    width: 220,
  },
  webId: {
    title: "Web",
    id: "webId",
    width: 150,
  },
  sourceEntity: {
    title: "Source",
    id: "sourceEntity",
    width: 200,
  },
  targetEntity: {
    title: "Target",
    id: "targetEntity",
    width: 200,
  },
  archived: {
    title: "Archived",
    id: "archived",
    width: 200,
  },
  lastEdited: {
    title: "Last Edited",
    id: "lastEdited",
    width: 200,
  },
  lastEditedById: {
    title: "Last Edited By",
    id: "lastEditedById",
    width: 200,
  },
  created: {
    title: "Created",
    id: "created",
    width: 200,
  },
  createdById: {
    title: "Created By",
    id: "createdById",
    width: 200,
  },
};

let canvas: HTMLCanvasElement | undefined = undefined;

const getTextWidth = (text: string) => {
  canvas ??= document.createElement("canvas");

  const context = canvas.getContext("2d")!;

  context.font = gridHeaderBaseFont;

  const metrics = context.measureText(text);
  return metrics.width;
};

const assembleEntitiesTableColumns = ({
  propertyColumns,
  sharedTypeTitle,
  hideColumns,
  hideArchivedColumn,
  allRowsMissSource,
  allRowsMissTarget,
}: {
  propertyColumns: EntitiesTableColumn[];
  /** The type title shared by every row, taking over the label column's header. */
  sharedTypeTitle: string | undefined;
  hideColumns?: (keyof EntitiesTableRow)[];
  hideArchivedColumn?: boolean;
  allRowsMissSource: boolean;
  allRowsMissTarget: boolean;
}): EntitiesTableColumn[] => {
  const columns: EntitiesTableColumn[] = [
    {
      title: sharedTypeTitle ?? "Entity",
      id: "entityLabel",
      width: 300,
      grow: 1,
    },
  ];

  const columnsToHide = hideColumns ? [...hideColumns] : [];
  if (hideArchivedColumn) {
    columnsToHide.push("archived");
  }

  if (allRowsMissSource) {
    columnsToHide.push("sourceEntity");
  }

  if (allRowsMissTarget) {
    columnsToHide.push("targetEntity");
  }

  for (const [columnKey, definition] of typedEntries(
    staticColumnDefinitionsByKey,
  )) {
    if (!columnsToHide.includes(columnKey)) {
      columns.push(definition);
    }
  }

  columns.push(
    ...propertyColumns.sort((a, b) => a.title.localeCompare(b.title)),
  );

  return columns;
};

const linkEndpointCell = (
  endpoint: EntityTableLinkEndpoint,
  closedMultiEntityTypesRootMap: ClosedMultiEntityTypesRootMap,
): NonNullable<EntitiesTableRow["sourceEntity"]> => {
  const closedMultiEntityType = getClosedMultiEntityTypeFromMap(
    closedMultiEntityTypesRootMap,
    endpoint.entityTypeIds,
  );

  let isLink = false;
  for (const entityType of closedMultiEntityType.allOf) {
    for (const typeOrAncestor of entityType.allOf) {
      if (typeOrAncestor.$id === blockProtocolEntityTypes.link.entityTypeId) {
        isLink = true;
        break;
      }
    }
  }

  return {
    entityId: endpoint.entityId,
    label: endpoint.label ?? endpoint.entityId,
    icon: getDisplayFieldsForClosedEntityType(closedMultiEntityType).icon,
    isLink,
  };
};

/**
 * What a table's rows carry over from the pages already folded into it.
 *
 * Every field is an aggregate over all rows seen so far, so appending a page
 * costs the page rather than the whole table.
 */
export type TableDataAggregates = {
  rows: EntitiesTableRow[];
  propertyColumns: Map<string, EntitiesTableColumn>;
  dataTypesByProperty: VisibleDataTypeIdsByPropertyBaseUrl;
  entityTypesWithMultipleVersions: Set<VersionedUrl>;
  firstSeenEntityTypeByBaseUrl: { [baseUrl: string]: VersionedUrl };
  /**
   * The type titles every row so far shares, or `null` before the first row —
   * the seed the following rows intersect against.
   */
  sharedEntityTypeTitles: Set<string> | null;
  rowsMissingSource: number;
  rowsMissingTarget: number;
};

const emptyAggregates = (): TableDataAggregates => ({
  rows: [],
  propertyColumns: new Map(),
  dataTypesByProperty: {},
  entityTypesWithMultipleVersions: new Set(),
  firstSeenEntityTypeByBaseUrl: {},
  sharedEntityTypeTitles: null,
  rowsMissingSource: 0,
  rowsMissingTarget: 0,
});

/**
 * Copies the aggregates so a fold never mutates the ones already rendered.
 */
const carryOver = (previous: TableDataAggregates): TableDataAggregates => ({
  rows: [...previous.rows],
  propertyColumns: new Map(previous.propertyColumns),
  dataTypesByProperty: Object.fromEntries(
    Object.entries(previous.dataTypesByProperty).map(([baseUrl, dataTypes]) => [
      baseUrl,
      new Set(dataTypes),
    ]),
  ),
  entityTypesWithMultipleVersions: new Set(
    previous.entityTypesWithMultipleVersions,
  ),
  firstSeenEntityTypeByBaseUrl: { ...previous.firstSeenEntityTypeByBaseUrl },
  sharedEntityTypeTitles: previous.sharedEntityTypeTitles
    ? new Set(previous.sharedEntityTypeTitles)
    : null,
  rowsMissingSource: previous.rowsMissingSource,
  rowsMissingTarget: previous.rowsMissingTarget,
});

/**
 * Builds the table's rows and columns from `queryEntitiesTable` endpoint rows,
 * appending them to the rows a previous page left behind.
 */
export const generateTableDataFromEndpointRows = ({
  closedMultiEntityTypesRootMap,
  definitions,
  endpointRows,
  previous,
  hideColumns,
  hideArchivedColumn,
}: {
  closedMultiEntityTypesRootMap: ClosedMultiEntityTypesRootMap;
  definitions: EntityTypeResolveDefinitions;
  endpointRows: EndpointRow[];
  /** The aggregates of the pages already folded in, if this appends to them. */
  previous?: TableDataAggregates;
  hideColumns?: (keyof EntitiesTableRow)[];
  hideArchivedColumn?: boolean;
}): { tableData: EntitiesTableData; aggregates: TableDataAggregates } => {
  const aggregates = previous ? carryOver(previous) : emptyAggregates();
  const {
    dataTypesByProperty,
    propertyColumns: propertyColumnsMap,
    entityTypesWithMultipleVersions,
    firstSeenEntityTypeByBaseUrl,
    rows,
  } = aggregates;

  for (const endpointRow of endpointRows) {
    const closedMultiEntityType: ClosedMultiEntityType =
      getClosedMultiEntityTypeFromMap(
        closedMultiEntityTypesRootMap,
        endpointRow.entityTypeIds,
      );

    const entityLabel =
      endpointRow.label ??
      generateEntityLabel(closedMultiEntityType, {
        properties: endpointRow.properties,
        metadata: {
          recordId: {
            entityId: endpointRow.entityId,
            editionId: endpointRow.entityEditionId,
          },
          entityTypeIds: endpointRow.entityTypeIds,
        },
      });

    for (const entityTypeId of endpointRow.entityTypeIds) {
      const baseUrl = extractBaseUrl(entityTypeId);

      if (
        firstSeenEntityTypeByBaseUrl[baseUrl] !== entityTypeId &&
        firstSeenEntityTypeByBaseUrl[baseUrl]
      ) {
        entityTypesWithMultipleVersions.add(entityTypeId);
        entityTypesWithMultipleVersions.add(
          firstSeenEntityTypeByBaseUrl[baseUrl],
        );
      } else {
        firstSeenEntityTypeByBaseUrl[baseUrl] = entityTypeId;
      }
    }

    let entityIcon: string | undefined;
    const entityTypeTitles = new Set<string>();
    for (const entityTypeMetadata of closedMultiEntityType.allOf) {
      entityTypeTitles.add(entityTypeMetadata.title);

      for (const typeOrAncestor of entityTypeMetadata.allOf) {
        if (typeOrAncestor.icon) {
          entityIcon = typeOrAncestor.icon;
          break;
        }
      }
    }

    if (aggregates.sharedEntityTypeTitles === null) {
      aggregates.sharedEntityTypeTitles = entityTypeTitles;
    } else {
      for (const sharedTitle of aggregates.sharedEntityTypeTitles) {
        if (!entityTypeTitles.has(sharedTitle)) {
          aggregates.sharedEntityTypeTitles.delete(sharedTitle);
        }
      }
    }

    const isPage = includesPageEntityTypeId(endpointRow.entityTypeIds);

    const propertyCellsForRow: Record<BaseUrl, EntitiesTableRowPropertyCell> =
      {};

    for (const [baseUrl, schema] of typedEntries(
      closedMultiEntityType.properties,
    )) {
      const propertyTypeId = "$ref" in schema ? schema.$ref : schema.items.$ref;

      const propertyType = definitions.propertyTypes[propertyTypeId];

      if (!propertyType) {
        throw new Error(
          `Property type not found for ${propertyTypeId} in ${endpointRow.entityId}`,
        );
      }

      const isArray = "items" in schema || "items" in propertyType.oneOf[0];

      const value = endpointRow.properties[baseUrl];
      if (value !== undefined) {
        const propertyMetadata = endpointRow.propertiesMetadata.value[baseUrl];

        if (!propertyMetadata) {
          throw new Error(
            `Property metadata not found for ${baseUrl} in ${endpointRow.entityId}`,
          );
        }

        propertyCellsForRow[baseUrl] = {
          isArray,
          propertyMetadata,
          value,
        };
      }

      if (!propertyColumnsMap.has(baseUrl)) {
        const width = getTextWidth(propertyType.title) + 100;

        propertyColumnsMap.set(baseUrl, {
          id: baseUrl,
          title: propertyType.title,
          width,
        });
      }
    }

    const sourceEntity = endpointRow.sourceEntity
      ? linkEndpointCell(
          endpointRow.sourceEntity,
          closedMultiEntityTypesRootMap,
        )
      : undefined;
    const targetEntity = endpointRow.targetEntity
      ? linkEndpointCell(
          endpointRow.targetEntity,
          closedMultiEntityTypesRootMap,
        )
      : undefined;
    if (!sourceEntity) {
      aggregates.rowsMissingSource += 1;
    }
    if (!targetEntity) {
      aggregates.rowsMissingTarget += 1;
    }

    for (const [baseUrl, { metadata }] of typedEntries(
      endpointRow.propertiesMetadata.value,
    )) {
      if (metadata && "dataTypeId" in metadata && metadata.dataTypeId) {
        dataTypesByProperty[baseUrl] ??= new Set();

        const dataType = definitions.dataTypes[metadata.dataTypeId];

        if (!dataType) {
          throw new Error(
            `Could not find dataType with id ${metadata.dataTypeId} in the definitions`,
          );
        }

        dataTypesByProperty[baseUrl].add(dataType);
      }
    }

    rows.push({
      rowId: endpointRow.entityId,
      entityId: endpointRow.entityId,
      entityLabel,
      entityIcon,
      entityTypes: closedMultiEntityType.allOf.map((entityType) => {
        let isLink = false;
        let icon: string | undefined;

        for (const typeOrAncestor of entityType.allOf) {
          if (!icon && typeOrAncestor.icon) {
            icon = typeOrAncestor.icon;
          }

          if (
            !isLink &&
            typeOrAncestor.$id === blockProtocolEntityTypes.link.entityTypeId
          ) {
            isLink = true;
          }
        }

        return {
          title: entityType.title,
          entityTypeId: entityType.$id,
          icon,
          isLink,
          version: extractVersion(entityType.$id),
        };
      }),
      webId: extractWebIdFromEntityId(endpointRow.entityId),
      archived: isPage
        ? simplifyProperties(endpointRow.properties as PageProperties).archived
        : endpointRow.archived,
      lastEdited: format(
        new Date(endpointRow.editionCreatedAtDecisionTime),
        "yyyy-MM-dd HH:mm",
      ),
      lastEditedById: endpointRow.lastEditedBy,
      created: format(
        new Date(endpointRow.createdAtDecisionTime),
        "yyyy-MM-dd HH:mm",
      ),
      createdById: endpointRow.createdBy,
      sourceEntity,
      targetEntity,
      applicableProperties: typedKeys(closedMultiEntityType.properties),
      ...propertyCellsForRow,
    });
  }

  return {
    tableData: {
      columns: assembleEntitiesTableColumns({
        propertyColumns: Array.from(propertyColumnsMap.values()),
        sharedTypeTitle: aggregates.sharedEntityTypeTitles?.values().next()
          .value,
        hideColumns,
        hideArchivedColumn,
        allRowsMissSource: aggregates.rowsMissingSource === rows.length,
        allRowsMissTarget: aggregates.rowsMissingTarget === rows.length,
      }),
      dataTypeDefinitions: definitions.dataTypes,
      rows,
      entityTypesWithMultipleVersionsPresent: entityTypesWithMultipleVersions,
      visibleDataTypeIdsByPropertyBaseUrl: dataTypesByProperty,
    },
    aggregates,
  };
};
