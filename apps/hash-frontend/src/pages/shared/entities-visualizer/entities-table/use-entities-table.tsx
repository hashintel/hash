import type { VersionedUrl } from "@blockprotocol/type-system";
import type { AccountId } from "@local/hash-graph-types/account";
import type { PropertyTypeWithMetadata } from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import { serializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getPropertyTypesForEntityType,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { useEffect, useMemo, useRef, useState } from "react";

import { gridHeaderBaseFont } from "../../../../components/grid/grid";
import { useGetOwnerForEntity } from "../../../../components/hooks/use-get-owner-for-entity";
import type { MinimalActor } from "../../../../shared/use-actors";
import { useActors } from "../../../../shared/use-actors";
import type {
  EntitiesTableData,
  GenerateEntitiesTableDataRequestMessage,
  TypeEntitiesRow,
} from "./use-entities-table/types";
import { isGenerateEntitiesTableDataResultMessage } from "./use-entities-table/types";
import type { EntitiesVisualizerData } from "../use-entities-visualizer-data";

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

export const useEntitiesTable = (
  params: Pick<
    EntitiesVisualizerData,
    | "createdByIds"
    | "editionCreatedByIds"
    | "entities"
    | "entityTypes"
    | "propertyTypes"
    | "subgraph"
    | "typeIds"
    | "webIds"
  > & {
    hasSomeLinks?: boolean;
    hideColumns?: (keyof TypeEntitiesRow)[];
    hideArchivedColumn?: boolean;
    hidePropertiesColumns: boolean;
  },
): { loading: boolean; tableData: EntitiesTableData | null } => {
  const {
    createdByIds,
    editionCreatedByIds,
    entities,
    entityTypes,
    subgraph,
    hasSomeLinks,
    hideColumns,
    hideArchivedColumn = false,
    hidePropertiesColumns,
    propertyTypes,
    typeIds,
    webIds,
  } = params;

  const [worker, setWorker] = useState<Worker | null>(null);

  useEffect(() => {
    const webWorker = new Worker(
      new URL("./use-entities-table/worker.ts", import.meta.url),
    );
    setWorker(webWorker);

    return () => {
      webWorker.terminate();
    };
  }, []);

  const getOwnerForEntity = useGetOwnerForEntity();

  const {
    editorActorIds,
    entitiesHaveSameType,
    entityTypesWithMultipleVersionsPresent,
    usedPropertyTypesByEntityTypeId,
  } = useMemo<{
    editorActorIds: AccountId[];
    entitiesHaveSameType: boolean;
    entityTypesWithMultipleVersionsPresent: VersionedUrl[];
    usedPropertyTypesByEntityTypeId: PropertiesByEntityTypeId;
  }>(() => {
    if (
      !createdByIds ||
      !editionCreatedByIds ||
      !entities ||
      !subgraph ||
      !typeIds ||
      !webIds
    ) {
      return {
        editorActorIds: [],
        entitiesHaveSameType: false,
        entityTypesWithMultipleVersionsPresent: [],
        usedPropertyTypesByEntityTypeId: {},
      };
    }

    const propertyMap: PropertiesByEntityTypeId = {};

    const typesWithMultipleVersions: VersionedUrl[] = [];
    const firstSeenTypeByBaseUrl: { [baseUrl: string]: VersionedUrl } = {};
    const actorIds: AccountId[] = [];

    for (const entity of entities) {
      actorIds.push(
        entity.metadata.provenance.edition.createdById,
        entity.metadata.provenance.createdById,
      );

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
      editorActorIds: actorIds,
      entitiesHaveSameType: Object.keys(firstSeenTypeByBaseUrl).length === 1,
      entityTypesWithMultipleVersionsPresent: typesWithMultipleVersions,
      usedPropertyTypesByEntityTypeId: propertyMap,
    };
  }, [entities, subgraph]);

  const { actors, loading: actorsLoading } = useActors({
    accountIds: editorActorIds,
  });

  const actorsByAccountId: Record<AccountId, MinimalActor | null> =
    useMemo(() => {
      if (!actors) {
        return {};
      }

      const actorsByAccount: Record<AccountId, MinimalActor | null> = {};

      for (const actor of actors) {
        actorsByAccount[actor.accountId] = actor;
      }

      return actorsByAccount;
    }, [actors]);

  const webNameByOwnedById = useMemo(() => {
    if (!entities) {
      return {};
    }

    const webNameByOwner: Record<OwnedById, string> = {};

    for (const entity of entities) {
      const owner = getOwnerForEntity(entity);
      webNameByOwner[
        extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId)
      ] = owner.shortname;
    }

    return webNameByOwner;
  }, [entities, getOwnerForEntity]);

  const [tableData, setTableData] = useState<EntitiesTableData | null>(null);
  const [waitingTableData, setWaitingTableData] = useState(true);

  const accumulatedDataRef = useRef<{
    requestId: string;
    rows: TypeEntitiesRow[];
  }>({ requestId: "none", rows: [] });

  useEffect(() => {
    if (!worker) {
      return;
    }

    worker.onmessage = ({ data }) => {
      if (isGenerateEntitiesTableDataResultMessage(data)) {
        const { done, requestId, result } = data;
        setWaitingTableData(false);

        if (accumulatedDataRef.current.requestId !== requestId) {
          accumulatedDataRef.current = { requestId, rows: result.rows };
        } else {
          accumulatedDataRef.current.rows.push(...result.rows);
        }

        if (done) {
          setTableData({
            ...result,
            rows: accumulatedDataRef.current.rows,
          });
          accumulatedDataRef.current.rows = [];
        }
      }
    };
  }, [worker]);

  useEffect(() => {
    if (entities && entityTypes && subgraph && !actorsLoading) {
      const serializedSubgraph = serializeSubgraph(subgraph);

      if (!worker) {
        throw new Error("No worker available");
      }

      worker.postMessage({
        type: "generateEntitiesTableData",
        params: {
          actorsByAccountId,
          entities: entities.map((entity) => entity.toJSON()),
          entitiesHaveSameType,
          entityTypesWithMultipleVersionsPresent,
          entityTypes,
          propertyTypes,
          subgraph: serializedSubgraph,
          hasSomeLinks,
          hideColumns,
          hideArchivedColumn,
          hidePropertiesColumns,
          usedPropertyTypesByEntityTypeId,
          webNameByOwnedById,
        },
      } satisfies GenerateEntitiesTableDataRequestMessage);
    }
  }, [
    actorsByAccountId,
    actorsLoading,
    entities,
    entityTypes,
    entitiesHaveSameType,
    entityTypesWithMultipleVersionsPresent,
    hasSomeLinks,
    hideColumns,
    hideArchivedColumn,
    hidePropertiesColumns,
    propertyTypes,
    subgraph,
    usedPropertyTypesByEntityTypeId,
    webNameByOwnedById,
    worker,
  ]);

  return {
    tableData,
    loading: waitingTableData,
  };
};
