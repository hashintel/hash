import { useTheme } from "@mui/material";
import { useMemo } from "react";

import { LoadingSpinner } from "@hashintel/design-system";
import { HashEntity } from "@local/hash-graph-sdk/entity";

import { useFlowRunsContext } from "../../../../../shared/flow-runs-context";
import { useOwnedFrontierStore } from "../../../../../shared/graph-visualizer/entity-graph/use-frontier-expansion";
import { EntityGraphVisualizer } from "../../../../../shared/graph-visualizer/entity-graph/visualizer";
import { useSlideStack } from "../../../../../shared/slide-stack";
import { EmptyOutputBox } from "./shared/empty-output-box";
import { outputIcons } from "./shared/icons";
import { OutputContainer } from "./shared/output-container";

import type { EntityId } from "@blockprotocol/type-system";
import type { EntityForGraphChart } from "@hashintel/block-design-system";
import type { Entity as GraphApiEntity } from "@local/hash-graph-client";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

type EntityResultGraphProps = {
  closedMultiEntityTypesRootMap?: ClosedMultiEntityTypesRootMap;
  definitions?: ClosedMultiEntityTypesDefinitions;
  entities: EntityForGraphChart[];
};

/**
 * Placeholder provenance/versioning for PROPOSED entities (not yet in the
 * database, so they have none). Only shape-required by {@link HashEntity};
 * the graph reads identity, types, links, and properties.
 */
const PLACEHOLDER_TIMESTAMP = "1970-01-01T00:00:00Z";
const PLACEHOLDER_ACTOR = "00000000-0000-0000-0000-000000000000";

const placeholderInterval = {
  start: { kind: "inclusive" as const, limit: PLACEHOLDER_TIMESTAMP },
  end: { kind: "unbounded" as const },
};

/** Persisted entities pass through; proposed ones get wrapped for the visualizer. */
function toHashEntity(entity: EntityForGraphChart): HashEntity {
  if (entity instanceof HashEntity) {
    return entity;
  }

  const plain: GraphApiEntity = {
    metadata: {
      archived: false,
      entityTypeIds: [...entity.metadata.entityTypeIds],
      provenance: {
        createdById: PLACEHOLDER_ACTOR,
        createdAtDecisionTime: PLACEHOLDER_TIMESTAMP,
        createdAtTransactionTime: PLACEHOLDER_TIMESTAMP,
        edition: {
          createdById: PLACEHOLDER_ACTOR,
          actorType: "machine",
          origin: { type: "flow" },
        },
      },
      temporalVersioning: entity.metadata.temporalVersioning ?? {
        decisionTime: placeholderInterval,
        transactionTime: placeholderInterval,
      },
      recordId: entity.metadata.recordId,
    },
    properties: entity.properties,
    linkData: entity.linkData,
  };

  return new HashEntity(plain);
}

export const EntityResultGraph = ({
  closedMultiEntityTypesRootMap,
  definitions,
  entities,
}: EntityResultGraphProps) => {
  const { pushToSlideStack } = useSlideStack();
  const { selectedFlowRunId } = useFlowRunsContext();

  /**
   * If a Flow updates the same entity as non-draft multiple times, it will have a record of persisting
   * an entity with the same id multiple times. Duplicates crash the chart.
   * We could also deduplicate in the entities table, but having duplicates be visible there
   * will help to detect where update / deduplication logic can be improved in the inference process.
   */
  const deduplicatedEntities = useMemo(() => {
    const deduplicatedLatestEntitiesByEntityId: Record<EntityId, HashEntity> =
      {};
    for (const entity of entities) {
      const entityId = entity.metadata.recordId.entityId;

      const existing = deduplicatedLatestEntitiesByEntityId[entityId];

      if (
        !existing ||
        /**
         * If these are persisted entities, they will have temporal versions, and we can take the latest.
         * If they are proposed entities, they won't have temporal versioning (nor should they be duplicated)
         */
        (entity.metadata.temporalVersioning &&
          existing.metadata.temporalVersioning.decisionTime.start.limit <
            entity.metadata.temporalVersioning.decisionTime.start.limit)
      ) {
        deduplicatedLatestEntitiesByEntityId[entityId] = toHashEntity(entity);
      }
    }

    return Object.values(deduplicatedLatestEntitiesByEntityId);
  }, [entities]);

  /**
   * The worker's ingest is additive, so the data source's identity must
   * change whenever the entity set is REPLACED rather than appended to: a
   * different flow run, or the same run's graph flipping from proposed
   * entities to persisted ones (different entity ids for the same results).
   */
  const sourceKey = `${selectedFlowRunId ?? "no-run"}-${
    entities[0] instanceof HashEntity ? "persisted" : "proposed"
  }`;

  // Flow results are a fixed set (no frontier), but the visualizer's
  // expansion store is owned by the surface that owns the query.
  const frontierStore = useOwnedFrontierStore(sourceKey);

  const theme = useTheme();

  if (!closedMultiEntityTypesRootMap && !entities.length) {
    return (
      <OutputContainer sx={{ flex: 1.5 }}>
        <EmptyOutputBox
          Icon={outputIcons.graph}
          label="A graph of entities saved to HASH by the flow will appear here"
        />
      </OutputContainer>
    );
  }

  return (
    <OutputContainer sx={{ flex: 1.5, width: "100%", textAlign: "initial" }}>
      {closedMultiEntityTypesRootMap && (
        <EntityGraphVisualizer
          closedMultiEntityTypesRootMap={closedMultiEntityTypesRootMap}
          definitions={definitions}
          entities={deduplicatedEntities}
          frontierStore={frontierStore}
          sourceKey={sourceKey}
          loadingComponent={
            <LoadingSpinner size={42} color={theme.palette.blue[60]} />
          }
          onEntityClick={(entityId) => {
            pushToSlideStack({
              kind: "entity",
              itemId: entityId,
            });
          }}
        />
      )}
    </OutputContainer>
  );
};
