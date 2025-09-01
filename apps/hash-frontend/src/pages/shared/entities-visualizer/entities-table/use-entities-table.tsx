import type {
  ActorEntityUuid,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import { isBaseUrl } from "@blockprotocol/type-system";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import type { ClosedMultiEntityTypesRootMap } from "@local/hash-graph-sdk/ontology";
import { serializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import { useEffect, useMemo, useRef, useState } from "react";

import { gridHeaderBaseFont } from "../../../../components/grid/grid";
import { useGetOwnerForEntity } from "../../../../components/hooks/use-get-owner-for-entity";
import type { MinimalActor } from "../../../../shared/use-actors";
import { useActors } from "../../../../shared/use-actors";
import type { EntitiesVisualizerData } from "../use-entities-visualizer-data";
import type {
  EntitiesTableColumn,
  EntitiesTableData,
  EntitiesTableFilterData,
  EntitiesTableRow,
  GenerateEntitiesTableDataRequestMessage,
  VisibleDataTypeIdsByPropertyBaseUrl,
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
    isPaginating: boolean;
  },
): {
  entityTypesWithMultipleVersionsPresent: Set<VersionedUrl>;
  visibleDataTypesByPropertyBaseUrl: VisibleDataTypeIdsByPropertyBaseUrl;
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
    isPaginating,
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
          setTableData((currentTableData) => {
            /**
             * When paginating, we need to combine the following with previous results:
             * 1. Visible data types
             * 2. Entity types with multiple versions present
             * 3. The table data itself
             */

            if (isPaginating && currentTableData) {
              const combinedVisibleDataTypeIdsByPropertyBaseUrl: VisibleDataTypeIdsByPropertyBaseUrl =
                result.visibleDataTypeIdsByPropertyBaseUrl;
              for (const [baseUrl, dataTypeIds] of typedEntries(
                currentTableData.visibleDataTypeIdsByPropertyBaseUrl,
              )) {
                combinedVisibleDataTypeIdsByPropertyBaseUrl[baseUrl] ??=
                  new Set();
                combinedVisibleDataTypeIdsByPropertyBaseUrl[baseUrl] =
                  combinedVisibleDataTypeIdsByPropertyBaseUrl[baseUrl].union(
                    dataTypeIds,
                  );
              }

              const combinedEntityTypesWithMultipleVersionsPresent = new Set([
                ...currentTableData.entityTypesWithMultipleVersionsPresent,
                ...result.entityTypesWithMultipleVersionsPresent,
              ]);

              const addedColumnIds: Set<string> = new Set();
              const combinedColumns: EntitiesTableColumn[] = [];
              for (const column of [
                ...currentTableData.columns,
                ...result.columns,
              ]) {
                if (addedColumnIds.has(column.id)) {
                  continue;
                }

                addedColumnIds.add(column.id);

                const columnWithWidth = isBaseUrl(column.id)
                  ? {
                      ...column,
                      width: getTextWidth(column.title) + 105,
                    }
                  : column;

                combinedColumns.push(columnWithWidth);
              }

              return {
                rows: [
                  ...currentTableData.rows,
                  ...accumulatedDataRef.current.rows,
                ],
                columns: combinedColumns,
                entityTypesWithMultipleVersionsPresent:
                  combinedEntityTypesWithMultipleVersionsPresent,
                visibleDataTypeIdsByPropertyBaseUrl:
                  combinedVisibleDataTypeIdsByPropertyBaseUrl,
                filterData: {
                  ...result.filterData,
                  createdByActors,
                  entityTypeFilters,
                  lastEditedByActors,
                  webs,
                },
              };
            }

            return {
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
            };
          });
          setWaitingTableData(false);

          accumulatedDataRef.current.rows = [];
        }
      }
    };
  }, [
    createdByActors,
    entityTypeFilters,
    isPaginating,
    lastEditedByActors,
    webs,
    worker,
  ]);

  useEffect(() => {
    if (entities && subgraph && definitions && !actorsLoading) {
      console.log("Triggered!!!");
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
    hasSomeLinks,
    hideColumns,
    hideArchivedColumn,
    hidePropertiesColumns,
    subgraph,
    webNameByWebId,
    worker,
  ]);

  return {
    entityTypesWithMultipleVersionsPresent:
      tableData?.entityTypesWithMultipleVersionsPresent ?? new Set(),
    visibleDataTypesByPropertyBaseUrl:
      tableData?.visibleDataTypeIdsByPropertyBaseUrl ?? {},
    tableData,
    loading: waitingTableData || actorsLoading,
  };
};
