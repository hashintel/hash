import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import type { SerializedEntity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type {
  EntityId,
  PropertyMetadata,
  PropertyValue,
} from "@local/hash-graph-types/entity";
import type {
  BaseUrl,
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { SerializedSubgraph } from "@local/hash-subgraph";

import type { MinimalActor } from "../../../../shared/use-actors";

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
    version?: number;
  }[];
  archived?: boolean;
  lastEdited: string;
  lastEditedBy?: MinimalActor | "loading";
  created: string;
  createdBy?: MinimalActor | "loading";
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
  web: string;
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
      "createdBy" | "lastEditedBy" | "sourceEntity" | "targetEntity" | "web"
    >
  | BaseUrl;

export const filterableEntitiesTableColumnKeys: EntitiesTableColumnKey[] = [
  "entityTypes",
  "web",
  "createdBy",
  "lastEditedBy",
] as const;

export type FilterableEntitiesColumnKey =
  (typeof filterableEntitiesTableColumnKeys)[number];

export interface EntitiesTableColumn extends SizedGridColumn {
  id: EntitiesTableColumnKey;
}

export type SourceOrTargetFilterData = {
  count: number;
  entityId: string;
  label: string;
};

export type GenerateEntitiesTableDataParams = {
  actorsByAccountId: Record<AccountId, MinimalActor | null>;
  closedMultiEntityTypesRootMap: ClosedMultiEntityTypesRootMap;
  definitions: ClosedMultiEntityTypesDefinitions;
  entities: SerializedEntity[];
  entityTypesWithMultipleVersionsPresent: VersionedUrl[];
  subgraph: SerializedSubgraph;
  hasSomeLinks?: boolean;
  hideColumns?: (keyof EntitiesTableRow)[];
  hideArchivedColumn?: boolean;
  hidePropertiesColumns: boolean;
  webNameByOwnedById: Record<OwnedById, string>;
};

export type ActorTableFilterData = {
  accountId: AccountId;
  displayName?: string;
  count: number;
};

export type EntityTypeTableFilterData = {
  entityTypeId: VersionedUrl;
  title: string;
  count: number;
  version?: number;
};

export type WebTableFilterData = {
  webId: OwnedById;
  count: number;
  shortname: string;
};

export type EntitiesTableFilterData = {
  createdByActors: ActorTableFilterData[];
  lastEditedByActors: ActorTableFilterData[];
  entityTypeFilters: EntityTypeTableFilterData[];
  noSourceCount: number;
  noTargetCount: number;
  sources: SourceOrTargetFilterData[];
  targets: SourceOrTargetFilterData[];
  webs: WebTableFilterData[];
};

export type EntitiesTableData = {
  columns: EntitiesTableColumn[];
  filterData: EntitiesTableFilterData;
  rows: EntitiesTableRow[];
};

export type GenerateEntitiesTableDataRequestMessage = {
  type: "generateEntitiesTableData";
  params: GenerateEntitiesTableDataParams;
};

export const isGenerateEntitiesTableDataRequestMessage = (
  message: unknown,
): message is GenerateEntitiesTableDataRequestMessage =>
  typeof message === "object" &&
  message !== null &&
  (message as Record<string, unknown>).type ===
    ("generateEntitiesTableData" satisfies GenerateEntitiesTableDataRequestMessage["type"]);

export type WorkerDataReturn = Pick<EntitiesTableData, "rows" | "columns"> & {
  filterData: Omit<
    EntitiesTableFilterData,
    "createdByActors" | "entityTypeFilters" | "lastEditedByActors" | "webs"
  >;
};

export type GenerateEntitiesTableDataResultMessage = {
  done: boolean;
  type: "generateEntitiesTableDataResult";
  requestId: string;
  result: WorkerDataReturn;
};

export const isGenerateEntitiesTableDataResultMessage = (
  message: unknown,
): message is GenerateEntitiesTableDataResultMessage =>
  typeof message === "object" &&
  message !== null &&
  (message as Record<string, unknown>).type ===
    ("generateEntitiesTableDataResult" satisfies GenerateEntitiesTableDataResultMessage["type"]);
