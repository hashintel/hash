import type {
  ActorEntityUuid,
  BaseUrl,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import {
  extractBaseUrl,
  extractVersion,
  isBaseUrl,
} from "@blockprotocol/type-system";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import type {
  ClosedDataTypeDefinition,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";
import { serializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
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

export const getTextWidth = (text: string) => {
  canvas ??= document.createElement("canvas");

  const context = canvas.getContext("2d")!;

  context.font = gridHeaderBaseFont;

  const metrics = context.measureText(text);
  return metrics.width;
};

export const useEntitiesTable = (
  params: Pick<
    EntitiesVisualizerData,
    | "createdByIds"
    | "definitions"
    | "editionCreatedByIds"
    | "entities"
    | "subgraph"
    | "typeIds"
    | "typeTitles"
    | "webIds"
  > & {
    closedMultiEntityTypesRootMap: ClosedMultiEntityTypesRootMap;
    hasSomeLinks?: boolean;
    hideColumns?: (keyof EntitiesTableRow)[];
    hideArchivedColumn?: boolean;
    hidePropertiesColumns: boolean;
  },
): {
  visibleDataTypesByPropertyBaseUrl: Record<
    BaseUrl,
    ClosedDataTypeDefinition[]
  >;
  loading: boolean;
  tableData: EntitiesTableData | null;
} => {
  const {
    closedMultiEntityTypesRootMap,
    createdByIds,
    definitions,
    editionCreatedByIds,
    entities,
    subgraph,
    hasSomeLinks,
    hideColumns,
    hideArchivedColumn = false,
    hidePropertiesColumns,
    typeIds,
    typeTitles,
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
    entityTypesWithMultipleVersionsPresent,
    visibleDataTypeIdsByPropertyBaseUrl,
  } = useMemo<{
    visibleDataTypeIdsByPropertyBaseUrl: Record<
      BaseUrl,
      Set<ClosedDataTypeDefinition>
    >;
    entityTypesWithMultipleVersionsPresent: VersionedUrl[];
  }>(() => {
    if (!entities || !definitions) {
      return {
        entityTypesWithMultipleVersionsPresent: [],
        visibleDataTypeIdsByPropertyBaseUrl: {},
      };
    }

    const dataTypesByProperty: {
      [propertyBaseUrl: BaseUrl]: Set<ClosedDataTypeDefinition>;
    } = {};

    const typesWithMultipleVersions: VersionedUrl[] = [];
    const firstSeenTypeByBaseUrl: { [baseUrl: string]: VersionedUrl } = {};

    for (const entity of entities) {
      for (const [baseUrl, { metadata }] of typedEntries(
        entity.propertiesMetadata.value,
      )) {
        if (metadata && "dataTypeId" in metadata && metadata.dataTypeId) {
          dataTypesByProperty[baseUrl] ??= new Set();

          const dataType = definitions.dataTypes[metadata.dataTypeId];

          if (!dataType) {
            throw new Error(
              `Could not find dataType with id ${metadata.dataTypeId} in subgraph`,
            );
          }

          /**
           * As there is only one instance of each DataType in the subgraph, it'll be the same object in memory,
           * and the Set equality check will work.
           */
          dataTypesByProperty[baseUrl].add(dataType);
        }
      }

      for (const entityTypeId of entity.metadata.entityTypeIds) {
        const baseUrl = extractBaseUrl(entityTypeId);
        if (firstSeenTypeByBaseUrl[baseUrl]) {
          typesWithMultipleVersions.push(entityTypeId);
          typesWithMultipleVersions.push(firstSeenTypeByBaseUrl[baseUrl]);
        } else {
          firstSeenTypeByBaseUrl[baseUrl] = entityTypeId;
        }
      }
    }

    return {
      visibleDataTypeIdsByPropertyBaseUrl: dataTypesByProperty,
      entityTypesWithMultipleVersionsPresent: typesWithMultipleVersions,
    };
  }, [definitions, entities]);

  const editorActorIds = useMemo(() => {
    const editorIds = new Set<ActorEntityUuid>([
      ...typedKeys(editionCreatedByIds ?? {}),
      ...typedKeys(createdByIds ?? {}),
    ]);

    return [...editorIds];
  }, [createdByIds, editionCreatedByIds]);

  const { actors, loading: actorsLoading } = useActors({
    accountIds: editorActorIds,
  });

  const actorsByAccountId: Record<ActorEntityUuid, MinimalActor | null> =
    useMemo(() => {
      if (!actors) {
        return {};
      }

      const actorsByAccount: Record<ActorEntityUuid, MinimalActor | null> = {};

      for (const actor of actors) {
        actorsByAccount[actor.accountId] = actor;
      }

      return actorsByAccount;
    }, [actors]);

  const webNameByWebId = useMemo(() => {
    if (!entities || !webIds) {
      return {};
    }

    const webNameByOwner: Record<WebId, string> = {};

    for (const webId of typedKeys(webIds)) {
      const owner = getOwnerForEntity({ webId });
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
      for (const [actorId, count] of typedEntries(createdByIds ?? {})) {
        const actor = actorsByAccountId[actorId];
        createdBy.push({
          actorId,
          count,
          displayName: actor?.displayName ?? actorId,
        });
      }

      const editedBy: EntitiesTableFilterData["lastEditedByActors"] = [];
      for (const [actorId, count] of typedEntries(editionCreatedByIds ?? {})) {
        const actor = actorsByAccountId[actorId];
        editedBy.push({
          actorId,
          count,
          displayName: actor?.displayName ?? actorId,
        });
      }

      const types: EntitiesTableFilterData["entityTypeFilters"] = [];
      for (const [entityTypeId, count] of typedEntries(typeIds ?? {})) {
        const title = typeTitles?.[entityTypeId];

        if (!title) {
          throw new Error(
            `Could not find title for entity type ${entityTypeId}`,
          );
        }

        types.push({
          count,
          entityTypeId,
          title,
          version: entityTypesWithMultipleVersionsPresent.includes(entityTypeId)
            ? extractVersion(entityTypeId)
            : undefined,
        });
      }

      const webCounts: EntitiesTableFilterData["webs"] = [];
      for (const [webId, count] of typedEntries(webIds ?? {})) {
        const webname = webNameByWebId[webId] ?? webId;
        webCounts.push({
          count,
          shortname: `@${webname}`,
          webId,
        });
      }

      return {
        createdByActors: createdBy,
        entityTypeFilters: types,
        lastEditedByActors: editedBy,
        webs: webCounts,
      };
    }, [
      actorsByAccountId,
      createdByIds,
      editionCreatedByIds,
      entityTypesWithMultipleVersionsPresent,
      typeIds,
      typeTitles,
      webIds,
      webNameByWebId,
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
            columns: result.columns.map((column) => {
              if (isBaseUrl(column.id)) {
                /**
                 * The web worker can't measure text for us (no DOM) so we need to do it here.
                 * We add extra to account for potential header buttons and padding.
                 */
                return {
                  ...column,
                  width: getTextWidth(column.title) + 105,
                };
              }
              return column;
            }),
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
    if (entities && subgraph && definitions && !actorsLoading) {
      const serializedSubgraph = serializeSubgraph(subgraph);

      if (!worker) {
        throw new Error("No worker available");
      }

      setWaitingTableData(true);

      worker.postMessage({
        type: "generateEntitiesTableData",
        params: {
          actorsByAccountId,
          closedMultiEntityTypesRootMap,
          definitions,
          entities: entities.map((entity) => entity.toJSON()),
          entityTypesWithMultipleVersionsPresent,
          subgraph: serializedSubgraph,
          hasSomeLinks,
          hideColumns,
          hideArchivedColumn,
          hidePropertiesColumns,
          webNameByWebId,
        },
      } satisfies GenerateEntitiesTableDataRequestMessage);
    }
  }, [
    actorsByAccountId,
    actorsLoading,
    closedMultiEntityTypesRootMap,
    definitions,
    entities,
    entityTypesWithMultipleVersionsPresent,
    hasSomeLinks,
    hideColumns,
    hideArchivedColumn,
    hidePropertiesColumns,
    subgraph,
    webNameByWebId,
    worker,
  ]);

  return {
    visibleDataTypesByPropertyBaseUrl: Object.fromEntries(
      Object.entries(visibleDataTypeIdsByPropertyBaseUrl).map(
        ([baseUrl, dataTypeIds]) => [baseUrl, Array.from(dataTypeIds)],
      ),
    ),
    tableData,
    loading: waitingTableData || actorsLoading,
  };
};
