import type {
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import type { SerializedEntity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { EntityId, PropertyValue } from "@local/hash-graph-types/entity";
import type {
  BaseUrl,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { SerializedSubgraph } from "@local/hash-subgraph";

import type { MinimalActor } from "../../../../shared/use-actors";

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

  [key: BaseUrl]: PropertyValue;
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

export interface EntitiesTableColumn extends SizedGridColumn {
  id: EntitiesTableColumnKey;
}

export type SourceOrTargetFilterData = {
  count: number;
  entityId: string;
  label: string;
};

export type PropertiesByEntityTypeId = {
  [entityTypeId: VersionedUrl]: {
    propertyType: PropertyTypeWithMetadata;
    width: number;
  }[];
};

export type GenerateEntitiesTableDataParams = {
  actorsByAccountId: Record<AccountId, MinimalActor | null>;
  entities: SerializedEntity[];
  entitiesHaveSameType: boolean;
  entityTypesWithMultipleVersionsPresent: VersionedUrl[];
  entityTypes: EntityType[];
  propertyTypes?: PropertyType[];
  subgraph: SerializedSubgraph;
  hasSomeLinks?: boolean;
  hideColumns?: (keyof EntitiesTableRow)[];
  hideArchivedColumn?: boolean;
  hidePropertiesColumns: boolean;
  usedPropertyTypesByEntityTypeId: PropertiesByEntityTypeId;
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
