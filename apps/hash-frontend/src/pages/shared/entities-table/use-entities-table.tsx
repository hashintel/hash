import type {
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { PropertyTypeWithMetadata } from "@local/hash-graph-types/ontology";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getPropertyTypesForEntityType,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { useEffect, useMemo, useState } from "react";

import { gridHeaderBaseFont } from "../../../components/grid/grid";
import { useGetOwnerForEntity } from "../../../components/hooks/use-get-owner-for-entity";
import { useActors } from "../../../shared/use-actors";
import type {
  EntitiesTableData,
  GenerateEntitiesTableDataResultMessage,
  TypeEntitiesRow,
} from "./use-entities-table/types";

let canvas: HTMLCanvasElement | undefined = undefined;

const getTextWidth = (text: string) => {
  canvas ??= document.createElement("canvas");

  const context = canvas.getContext("2d")!;

  context.font = gridHeaderBaseFont;

  const metrics = context.measureText(text);
  return metrics.width;
};

type PropertiesByEntityTypeId = {
  [entityTypeId: VersionedUrl]: {
    propertyType: PropertyTypeWithMetadata;
    width: number;
  }[];
};

export const useEntitiesTable = (params: {
  entities?: Entity[];
  entityTypes?: EntityType[];
  propertyTypes?: PropertyType[];
  subgraph?: Subgraph<EntityRootType>;
  hasSomeLinks?: boolean;
  hideColumns?: (keyof TypeEntitiesRow)[];
  hidePageArchivedColumn?: boolean;
  hidePropertiesColumns: boolean;
  isViewingOnlyPages?: boolean;
}): { loading: boolean; tableData: EntitiesTableData | null } => {
  const {
    entities,
    entityTypes,
    subgraph,
    hasSomeLinks,
    hideColumns,
    hidePageArchivedColumn = false,
    hidePropertiesColumns,
    isViewingOnlyPages = false,
    propertyTypes,
  } = params;

  const worker = useMemo(
    () =>
      new Worker(new URL("./path-finder-control/worker.ts", import.meta.url)),
    [],
  );

  const editorActorIds = useMemo(
    () =>
      entities?.flatMap(({ metadata }) => [
        metadata.provenance.edition.createdById,
        metadata.provenance.createdById,
      ]),
    [entities],
  );

  const { actors, loading: actorsLoading } = useActors({
    accountIds: editorActorIds,
  });

  const getOwnerForEntity = useGetOwnerForEntity();

  const {
    entitiesHaveSameType,
    entityTypesWithMultipleVersionsPresent,
    usedPropertyTypesByEntityTypeId,
  } = useMemo<{
    entitiesHaveSameType: boolean;
    entityTypesWithMultipleVersionsPresent: VersionedUrl[];
    usedPropertyTypesByEntityTypeId: PropertiesByEntityTypeId;
  }>(() => {
    if (!entities || !subgraph) {
      return {
        entitiesHaveSameType: false,
        entityTypesWithMultipleVersionsPresent: [],
        usedPropertyTypesByEntityTypeId: {},
      };
    }

    const propertyMap: PropertiesByEntityTypeId = {};

    const typesWithMultipleVersions: VersionedUrl[] = [];
    const firstSeenTypeByBaseUrl: { [baseUrl: string]: VersionedUrl } = {};

    for (const entity of entities) {
      for (const entityTypeId of entity.metadata.entityTypeIds) {
        if (propertyMap[entityTypeId]) {
          continue;
        }

        const baseUrl = extractBaseUrl(entityTypeId);
        if (firstSeenTypeByBaseUrl[baseUrl]) {
          typesWithMultipleVersions.push(entityTypeId);
          typesWithMultipleVersions.push(firstSeenTypeByBaseUrl[baseUrl]);
        } else {
          firstSeenTypeByBaseUrl[baseUrl] = entityTypeId;
        }

        const entityType = getEntityTypeById(subgraph, entityTypeId);
        if (!entityType) {
          // eslint-disable-next-line no-console
          console.warn(
            `Could not find entityType with id ${entityTypeId}, it may be loading...`,
          );
          continue;
        }

        const propertyTypesForEntity = getPropertyTypesForEntityType(
          entityType.schema,
          subgraph,
        );

        propertyMap[entityTypeId] ??= [];

        for (const propertyType of propertyTypesForEntity.values()) {
          propertyMap[entityTypeId].push({
            propertyType,
            width: getTextWidth(propertyType.schema.title) + 70,
          });
        }
      }
    }

    return {
      entitiesHaveSameType: Object.keys(firstSeenTypeByBaseUrl).length === 1,
      entityTypesWithMultipleVersionsPresent: typesWithMultipleVersions,
      usedPropertyTypesByEntityTypeId: propertyMap,
    };
  }, [entities, subgraph]);

  const [tableData, setTableData] = useState<EntitiesTableData | null>(null);
  const [waitingTableData, setWaitingTableData] = useState(true);

  useEffect(() => {
    worker.onmessage = ({ data }) => {
      if (
        "type" in data &&
        data.type ===
          ("generateEntitiesTableDataResult" satisfies GenerateEntitiesTableDataResultMessage["type"])
      ) {
        setTableData((data as GenerateEntitiesTableDataResultMessage).result);
        setWaitingTableData(false);
      }
      return () => worker.terminate();
    };
  }, [worker]);

  useEffect(() => {
    if (entities && entityTypes && subgraph && !actorsLoading) {
      worker.postMessage({
        type: "generateEntitiesTableData",
        params: {
          actors: actors ?? [],
          entities,
          entitiesHaveSameType,
          entityTypesWithMultipleVersionsPresent,
          entityTypes,
          propertyTypes,
          subgraph,
          hasSomeLinks,
          hideColumns,
          hidePageArchivedColumn,
          hidePropertiesColumns,
          isViewingOnlyPages,
          usedPropertyTypesByEntityTypeId,
        },
      });
    }
  }, [
    actors,
    actorsLoading,
    entities,
    entityTypes,
    entitiesHaveSameType,
    entityTypesWithMultipleVersionsPresent,
    hasSomeLinks,
    hideColumns,
    hidePageArchivedColumn,
    hidePropertiesColumns,
    isViewingOnlyPages,
    propertyTypes,
    subgraph,
    usedPropertyTypesByEntityTypeId,
    worker,
  ]);

  return {
    tableData,
    loading: waitingTableData,
  };
};
