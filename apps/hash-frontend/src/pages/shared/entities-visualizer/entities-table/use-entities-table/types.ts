import type {
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import type { SerializedEntity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { EntityId } from "@local/hash-graph-types/entity";
import type {
  BaseUrl,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { SerializedSubgraph } from "@local/hash-subgraph";

import type { MinimalActor } from "../../../../../shared/use-actors";

export interface TypeEntitiesRow {
  rowId: string;
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
  properties?: {
    [k: string]: string;
  };
  applicableProperties: BaseUrl[];

  /** @todo: get rid of this by typing `columnId` */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
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
  hideColumns?: (keyof TypeEntitiesRow)[];
  hideArchivedColumn?: boolean;
  hidePropertiesColumns: boolean;
  usedPropertyTypesByEntityTypeId: PropertiesByEntityTypeId;
  webNameByOwnedById: Record<OwnedById, string>;
};

export type ActorTableData = { accountId: AccountId; displayName?: string };

export type EntitiesTableData = {
  columns: SizedGridColumn[];
  filterData: {
    createdByActors: ActorTableData[];
    lastEditedByActors: ActorTableData[];
    entityTypeTitles: { [entityTypeTitle: string]: number | undefined };
    noSourceCount: number;
    noTargetCount: number;
    sources: SourceOrTargetFilterData[];
    targets: SourceOrTargetFilterData[];
    webs: { [web: string]: number | undefined };
  };
  rows: TypeEntitiesRow[];
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

export type GenerateEntitiesTableDataResultMessage = {
  done: boolean;
  type: "generateEntitiesTableDataResult";
  requestId: string;
  result: EntitiesTableData;
};

export const isGenerateEntitiesTableDataResultMessage = (
  message: unknown,
): message is GenerateEntitiesTableDataResultMessage =>
  typeof message === "object" &&
  message !== null &&
  (message as Record<string, unknown>).type ===
    ("generateEntitiesTableDataResult" satisfies GenerateEntitiesTableDataResultMessage["type"]);
