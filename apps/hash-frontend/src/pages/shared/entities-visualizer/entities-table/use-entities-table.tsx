import type { VersionedUrl } from "@blockprotocol/type-system";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import type { AccountId } from "@local/hash-graph-types/account";
import type { PropertyTypeWithMetadata } from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import { serializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
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
import type { EntitiesVisualizerData } from "../use-entities-visualizer-data";
import type {
  EntitiesTableData,
  EntitiesTableFilterData,
  EntitiesTableRow,
  GenerateEntitiesTableDataRequestMessage,
} from "./types";
import { isGenerateEntitiesTableDataResultMessage } from "./types";

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
    hideColumns?: (keyof EntitiesTableRow)[];
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

  const editorActorIds = useMemo(() => {
    const editorIds = new Set<AccountId>([
      ...typedKeys(editionCreatedByIds ?? {}),
      ...typedKeys(createdByIds ?? {}),
    ]);

    return [...editorIds];
  }, [createdByIds, editionCreatedByIds]);

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
    if (!entities || !webIds) {
      return {};
    }

    const webNameByOwner: Record<OwnedById, string> = {};

    for (const webId of typedKeys(webIds)) {
      const owner = getOwnerForEntity({ ownedById: webId });
      webNameByOwner[webId] = owner.shortname;
    }

    return webNameByOwner;
  }, [entities, getOwnerForEntity, webIds]);

  const [tableData, setTableData] = useState<EntitiesTableData | null>(null);
  const [waitingTableData, setWaitingTableData] = useState(true);

  const accumulatedDataRef = useRef<{
    requestId: string;
    rows: EntitiesTableRow[];
  }>({ requestId: "none", rows: [] });

  const { createdByActors, entityTypeFilters, lastEditedByActors, webs } =
    useMemo<
      Pick<
        EntitiesTableFilterData,
        "createdByActors" | "entityTypeFilters" | "lastEditedByActors" | "webs"
      >
    >(() => {
      const createdBy: EntitiesTableFilterData["createdByActors"] = [];
      for (const [accountId, count] of typedEntries(createdByIds ?? {})) {
        const actor = actorsByAccountId[accountId];
        createdBy.push({
          accountId,
          count,
          displayName: actor?.displayName ?? accountId,
        });
      }

      const editedBy: EntitiesTableFilterData["lastEditedByActors"] = [];
      for (const [accountId, count] of typedEntries(
        editionCreatedByIds ?? {},
      )) {
        const actor = actorsByAccountId[accountId];
        editedBy.push({
          accountId,
          count,
          displayName: actor?.displayName ?? accountId,
        });
      }

      const typeTitles: EntitiesTableFilterData["entityTypeFilters"] = [];
      for (const [entityTypeId, count] of typedEntries(typeIds ?? {})) {
        const title = entityTypeId
          .split("/")
          .at(-3)!
          .split("-")
          .map(
            (segment) =>
              `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}`,
          )
          .join(" ");

        typeTitles.push({
          count,
          entityTypeId,
          title,
        });
      }

      const webCounts: EntitiesTableFilterData["webs"] = [];
      for (const [ownedById, count] of typedEntries(webIds ?? {})) {
        const webname = webNameByOwnedById[ownedById] ?? ownedById;
        webCounts.push({
          count,
          shortname: `@${webname}`,
          webId: ownedById,
        });
      }

      return {
        createdByActors: createdBy,
        entityTypeFilters: typeTitles,
        lastEditedByActors: editedBy,
        webs: webCounts,
      };
    }, [
      actorsByAccountId,
      createdByIds,
      editionCreatedByIds,
      typeIds,
      webIds,
      webNameByOwnedById,
    ]);

  useEffect(() => {
    if (!worker) {
      return;
    }

    worker.onmessage = ({ data }) => {
      if (isGenerateEntitiesTableDataResultMessage(data)) {
        const { done, requestId, result } = data;

        if (accumulatedDataRef.current.requestId !== requestId) {
          accumulatedDataRef.current = { requestId, rows: result.rows };
        } else {
          accumulatedDataRef.current.rows.push(...result.rows);
        }

        if (done) {
          setTableData({
            ...result,
            filterData: {
              ...result.filterData,
              createdByActors,
              entityTypeFilters,
              lastEditedByActors,
              webs,
            },
            rows: accumulatedDataRef.current.rows,
          });
          setWaitingTableData(false);

          accumulatedDataRef.current.rows = [];
        }
      }
    };
  }, [createdByActors, entityTypeFilters, lastEditedByActors, webs, worker]);

  useEffect(() => {
    if (entities && entityTypes && subgraph && !actorsLoading) {
      const serializedSubgraph = serializeSubgraph(subgraph);

      if (!worker) {
        throw new Error("No worker available");
      }

      setTableData(null);
      setWaitingTableData(true);

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
    loading: waitingTableData || actorsLoading,
  };
};
