import type {
  ActorEntityUuid,
  BaseUrl,
  EntityId,
  OntologyTypeVersion,
  PropertyMetadata,
  PropertyValue,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import type { EntityQueryCursor } from "@local/hash-graph-client/api";
import type {
  SerializedEntity,
  SerializedSubgraph,
} from "@local/hash-graph-sdk/entity";
import type {
  ClosedDataTypeDefinition,
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

import type { EntitiesVisualizerData } from "./use-entities-visualizer-data";

export type EntitiesTableRowPropertyCell = {
  isArray: boolean;
  propertyMetadata: PropertyMetadata;
  value: PropertyValue;
};

export interface EntitiesTableRow {
  rowId: EntityId;
  entityId: EntityId;
  entityIcon?: string;
  entityLabel: string;
  entityTypes: {
    entityTypeId: VersionedUrl;
    icon?: string;
    isLink: boolean;
    title: string;
    version: OntologyTypeVersion;
  }[];
  archived?: boolean;
  lastEdited: string;
  lastEditedById: ActorEntityUuid;
  created: string;
  createdById: ActorEntityUuid;
  sourceEntity?: {
    entityId: EntityId;
    label: string;
    icon?: string;
    isLink: boolean;
  };
  targetEntity?: {
    entityId: EntityId;
    label: string;
    icon?: string;
    isLink: boolean;
  };
  webId: WebId;
  applicableProperties: BaseUrl[];

  [key: BaseUrl]: EntitiesTableRowPropertyCell;
}

export type EntitiesTableColumnKey =
  | Exclude<
      keyof EntitiesTableRow,
      "rowId" | "entityId" | "entityIcon" | "applicableProperties"
    >
  | BaseUrl;

export type SortableEntitiesTableColumnKey =
  | Exclude<
      EntitiesTableColumnKey,
      /**
       * @todo H-3908 allow sorting by these fields
       */
      | "createdById"
      | "lastEditedById"
      | "sourceEntity"
      | "targetEntity"
      | "webId"
    >
  | BaseUrl;

export const filterableEntitiesTableColumnKeys: EntitiesTableColumnKey[] = [
  "entityTypes",
  "webId",
  "createdById",
  "lastEditedById",
] as const;

export type FilterableEntitiesColumnKey =
  (typeof filterableEntitiesTableColumnKeys)[number];

export interface EntitiesTableColumn extends SizedGridColumn {
  id: EntitiesTableColumnKey;
}

export type GenerateEntitiesTableDataParams = {
  closedMultiEntityTypesRootMap: ClosedMultiEntityTypesRootMap;
  definitions: ClosedMultiEntityTypesDefinitions;
  entities: SerializedEntity[];
  subgraph: SerializedSubgraph;
  hasSomeLinks?: boolean;
  hideColumns?: (keyof EntitiesTableRow)[];
  hideArchivedColumn?: boolean;
};

export type SourceOrTargetFilterData = {
  [entityId: string]: {
    count: number;
    label: string;
  };
};

export type ActorTableFilterData = {
  actorId: ActorEntityUuid;
  displayName?: string;
  count: number;
};

export type EntityTypeTableFilterData = {
  entityTypeId: VersionedUrl;
  title: string;
  count: number;
};

export type WebTableFilterData = {
  webId: WebId;
  count: number;
  shortname: string;
};

export type EntitiesTableFilterDataFromVisibleRows = {
  noSourceCount: number;
  noTargetCount: number;
  sources: SourceOrTargetFilterData;
  targets: SourceOrTargetFilterData;
};

export type VisibleDataTypeIdsByPropertyBaseUrl = Record<
  BaseUrl,
  Set<ClosedDataTypeDefinition>
>;

export type EntitiesTableData = {
  columns: EntitiesTableColumn[];
  entityTypesWithMultipleVersionsPresent: Set<VersionedUrl>;
  visibleRowsFilterData: EntitiesTableFilterDataFromVisibleRows;
  rows: EntitiesTableRow[];
  visibleDataTypeIdsByPropertyBaseUrl: VisibleDataTypeIdsByPropertyBaseUrl;
};

export type UpdateTableDataFn = (
  params: Pick<
    EntitiesVisualizerData,
    "definitions" | "entities" | "subgraph"
  > & {
    appliedPaginationCursor: EntityQueryCursor | null;
    closedMultiEntityTypesRootMap: ClosedMultiEntityTypesRootMap;
  },
) => void;
