import type {
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import { SizedGridColumn } from "@glideapps/glide-data-grid";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type {
  BaseUrl,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";

import type { MinimalActor } from "../../../../shared/use-actors";

export interface TypeEntitiesRow {
  rowId: string;
  entityId: EntityId;
  entity: Entity;
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
  actors: MinimalActor[];
  entities?: Entity[];
  entitiesHaveSameType: boolean;
  entityTypesWithMultipleVersionsPresent: VersionedUrl[];
  entityTypes?: EntityType[];
  propertyTypes?: PropertyType[];
  subgraph?: Subgraph<EntityRootType>;
  hasSomeLinks?: boolean;
  hideColumns?: (keyof TypeEntitiesRow)[];
  hidePageArchivedColumn?: boolean;
  hidePropertiesColumns: boolean;
  isViewingOnlyPages?: boolean;
  usedPropertyTypesByEntityTypeId: PropertiesByEntityTypeId;
};

export type EntitiesTableData = {
  columns: SizedGridColumn[];
  filterData: {
    createdByActors: MinimalActor[];
    lastEditedByActors: MinimalActor[];
    entityTypeTitles: { [entityTypeTitle: string]: number | undefined };
    noSourceCount: number;
    noTargetCount: number;
    sources: SourceOrTargetFilterData[];
    targets: SourceOrTargetFilterData[];
    webs: { [web: string]: number | undefined };
  };
  rows: TypeEntitiesRow[] | undefined;
};

export type GenerateEntitiesTableDataRequestMessage = {
  type: "generateEntitiesTableData";
  params: GenerateEntitiesTableDataParams;
};

export type GenerateEntitiesTableDataResultMessage = {
  type: "generateEntitiesTableDataResult";
  result: EntitiesTableData;
};
