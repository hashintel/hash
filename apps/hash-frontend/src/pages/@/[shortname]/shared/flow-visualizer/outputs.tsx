import { useQuery } from "@apollo/client";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import { buildSubgraph } from "@blockprotocol/graph/stdlib";
import type {
  EntityEditionId,
  EntityId,
  EntityUuid,
  LeftClosedTemporalInterval,
  Timestamp,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  currentTimestamp,
  generateTimestamp,
} from "@blockprotocol/type-system";
import type { EntityForGraphChart } from "@hashintel/block-design-system";
import { CheckRegularIcon, IconButton } from "@hashintel/design-system";
import type { Entity as GraphApiEntity } from "@local/hash-graph-client";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";
import { goalFlowDefinitionIds } from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import type { PersistedEntityMetadata } from "@local/hash-isomorphic-utils/flows/types";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import type { SvgIconProps } from "@mui/material";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import type { FunctionComponent, PropsWithChildren, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  FlowRun,
  GetClosedMultiEntityTypesQuery,
  GetClosedMultiEntityTypesQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { getClosedMultiEntityTypesQuery } from "../../../../../graphql/queries/ontology/entity-type.queries";
import { useFlowRunsContext } from "../../../../shared/flow-runs-context";
import { getFileProperties } from "../../../../shared/get-file-properties";
import { SlideStackProvider } from "../../../../shared/slide-stack";
import type { SlideItem } from "../../../../shared/slide-stack/types";
import { ClaimsOutput } from "./outputs/claims-output";
import { Deliverables } from "./outputs/deliverables";
import type { DeliverableData } from "./outputs/deliverables/shared/types";
import { EntityResultGraph } from "./outputs/entity-result-graph";
import { EntityResultTable } from "./outputs/entity-result-table";
import { outputIcons } from "./outputs/shared/icons";
import { flowSectionBorderRadius } from "./shared/styles";
import type { ProposedEntityOutput } from "./shared/types";

export const getDeliverables = (
  outputs: FlowRun["outputs"] | undefined,
  persistedEntities: HashEntity[],
): DeliverableData[] => {
  const flowOutputs = outputs?.[0]?.contents[0]?.outputs;

  const deliverables: DeliverableData[] = [];

  for (const output of flowOutputs ?? []) {
    const { payload } = output;

    if (payload.kind === "FormattedText" && !Array.isArray(payload.value)) {
      if (payload.value.format === "Markdown") {
        const markdown = payload.value.content;
        deliverables.push({
          displayName: "Markdown",
          type: "markdown",
          markdown,
        });
      }
    }

    if (
      payload.kind === "PersistedEntityMetadata" &&
      !Array.isArray(payload.value)
    ) {
      const persistedEntityId = payload.value.entityId;
      if (!persistedEntityId) {
        continue;
      }

      const entity = persistedEntities.find(
        (persisted) => persisted.entityId === persistedEntityId,
      );

      if (!entity) {
        continue;
      }

      const { displayName, fileName, fileUrl } = getFileProperties(
        entity.properties,
      );

      if (fileUrl) {
        deliverables.push({
          displayName,
          entityTypeId: entity.metadata.entityTypeIds[0],
          fileName,
          fileUrl,
          type: "file",
        });
      }
    }
  }

  return deliverables;
};

const SectionTabContainer = ({ children }: PropsWithChildren) => (
  <Stack
    alignItems="center"
    direction="row"
    gap={0.5}
    pt={0.9}
    pb={1.5}
    px={1}
    sx={{
      background: ({ palette }) => palette.gray[20],
      borderTopRightRadius: flowSectionBorderRadius,
      borderTopLeftRadius: flowSectionBorderRadius,
    }}
  >
    {children}
  </Stack>
);

const SectionTabButton = ({
  active,
  additionalControlElements,
  color,
  height,
  label,
  Icon,
  onClick,
}: {
  active: boolean;
  additionalControlElements?: ReactNode;
  color: "blue" | "white";
  height: number;
  label: string;
  Icon?: FunctionComponent<SvgIconProps>;
  onClick: () => void;
}) => {
  const additionalControlsAreDisplayed = additionalControlElements && active;

  return (
    <Stack
      direction="row"
      sx={[
        additionalControlsAreDisplayed
          ? { background: ({ palette }) => palette.common.white, p: "1.5px" }
          : {},
        {
          borderRadius: 16,
          height,
          transition: ({ transitions }) => transitions.create("background"),
        },
      ]}
    >
      <IconButton
        onClick={onClick}
        sx={({ palette }) => ({
          background:
            color === "white"
              ? active
                ? palette.common.white
                : palette.gray[20]
              : active
                ? palette.blue[70]
                : palette.blue[20],
          borderRadius: 16,
          px: additionalControlsAreDisplayed ? "10.5px" : "12px",
          py: 0,
          svg: {
            fontSize: 11,
          },
          "&:hover": {
            background: active
              ? color === "white"
                ? palette.common.white
                : palette.blue[70]
              : palette.gray[20],
          },
          transition: ({ transitions }) => transitions.create("background"),
        })}
      >
        {Icon && (
          <Icon
            sx={({ palette }) => ({
              color:
                color === "white"
                  ? active
                    ? palette.common.black
                    : palette.gray[80]
                  : active
                    ? palette.common.white
                    : palette.blue[70],
              display: "block",
              mr: 0.8,
            })}
          />
        )}

        <Typography
          component="span"
          sx={{
            color: ({ palette }) =>
              color === "white"
                ? active
                  ? palette.common.black
                  : palette.gray[80]
                : active
                  ? palette.common.white
                  : palette.blue[70],
            fontSize: 13,
            fontWeight: 500,
            textTransform: "capitalize",
            transition: ({ transitions }) => transitions.create("color"),
          }}
        >
          {label}
        </Typography>
      </IconButton>
      {additionalControlElements && (
        <Collapse
          orientation="horizontal"
          in={active}
          timeout={{ enter: 200, exit: 0 }}
        >
          {additionalControlElements}
        </Collapse>
      )}
    </Stack>
  );
};

const mockEntityFromProposedEntity = (
  proposedEntity: ProposedEntityOutput,
): HashEntity => {
  const editionId = new Date().toISOString() as EntityEditionId;

  const temporalInterval: LeftClosedTemporalInterval = {
    start: { kind: "inclusive", limit: editionId as string as Timestamp },
    end: { kind: "unbounded" },
  };

  const { sourceEntityId, targetEntityId } = proposedEntity;

  return new HashEntity({
    linkData:
      sourceEntityId && targetEntityId
        ? {
            leftEntityId:
              "localId" in sourceEntityId
                ? sourceEntityId.localId
                : sourceEntityId.entityId,
            rightEntityId:
              "localId" in targetEntityId
                ? targetEntityId.localId
                : targetEntityId.entityId,
          }
        : undefined,
    metadata: {
      recordId: {
        entityId: proposedEntity.localEntityId,
        editionId,
      },
      entityTypeIds: proposedEntity.entityTypeIds,
      temporalVersioning: {
        decisionTime: temporalInterval,
        transactionTime: temporalInterval,
      },
      archived: false,
      provenance: {
        createdAtDecisionTime: editionId,
        createdAtTransactionTime: editionId,
        createdById: "webId",
        edition: {
          createdById: "webId",
          actorType: "machine",
          origin: {
            type: "flow",
          },
        },
      },
      properties: proposedEntity.propertyMetadata,
    },
    properties: proposedEntity.properties,
  } satisfies GraphApiEntity);
};

type OutputsProps = {
  persistedEntities: HashEntity[];
  persistedEntitiesMetadata: PersistedEntityMetadata[];
  persistedEntitiesSubgraph?: Subgraph<EntityRootType>;
  persistedEntitiesTypesInfo?: {
    entityTypes: ClosedMultiEntityTypesRootMap;
    definitions: ClosedMultiEntityTypesDefinitions;
  };
  proposedEntities: ProposedEntityOutput[];
  relevantEntityIds: EntityId[];
};

/**
 * The Outputs component displays the results of a flow run:
 * 1. A table or graph view of entities (proposed before they are saved to the database – persisted afterwards)
 * 2. A list of claims made in relation to entities
 * 3. Any deliverables produced by the flow (e.g. a spreadsheet or report document)
 */
export const Outputs = ({
  persistedEntities,
  persistedEntitiesMetadata,
  persistedEntitiesSubgraph,
  persistedEntitiesTypesInfo,
  proposedEntities,
  relevantEntityIds,
}: OutputsProps) => {
  const { selectedFlowRun } = useFlowRunsContext();

  const hasClaims =
    !!selectedFlowRun &&
    goalFlowDefinitionIds.includes(
      selectedFlowRun.flowDefinitionId as EntityUuid,
    );

  const hasEntities =
    persistedEntitiesMetadata.length > 0 || proposedEntities.length > 0;

  const deliverables = useMemo(
    () => getDeliverables(selectedFlowRun?.outputs, persistedEntities),
    [selectedFlowRun, persistedEntities],
  );

  /**
   * Pair persisted entities with their operations from metadata.
   * This is used by EntityResultTable to show what operation was performed on each entity.
   */
  const persistedEntitiesWithOperation = useMemo(() => {
    const metadataByEntityId = new Map(
      persistedEntitiesMetadata.map((metadata) => [
        metadata.entityId,
        metadata.operation,
      ]),
    );

    return persistedEntities.map((entity) => ({
      entity,
      operation: metadataByEntityId.get(entity.entityId) ?? "create",
    }));
  }, [persistedEntities, persistedEntitiesMetadata]);

  const [entityDisplay, setEntityDisplay] = useState<"table" | "graph">(
    "table",
  );

  const [visibleSection, setVisibleSection] = useState<
    "claims" | "entities" | "deliverables"
  >(hasEntities ? "entities" : "claims");

  const uniqueProposedEntityTypeSets = useMemo(() => {
    /**
     * Extract unique sets of entity type IDs from proposed entities.
     * For example, if multiple entities have the same set of types [A, B],
     * we only include this combination once in the result.
     */
    const uniqueTypeIdSets = new Set<string>();

    for (const entity of proposedEntities) {
      const sortedTypeIds = [...entity.entityTypeIds].sort();

      const typeIdSetKey = sortedTypeIds.join(",");
      uniqueTypeIdSets.add(typeIdSetKey);
    }

    return Array.from(uniqueTypeIdSets).map(
      (typeIdSetKey) =>
        typeIdSetKey.split(",").filter((id) => id.length > 0) as VersionedUrl[],
    );
  }, [proposedEntities]);

  const {
    data: proposedEntitiesTypesData,
    previousData: previousProposedEntitiesTypesData,
  } = useQuery<
    GetClosedMultiEntityTypesQuery,
    GetClosedMultiEntityTypesQueryVariables
  >(getClosedMultiEntityTypesQuery, {
    fetchPolicy: "cache-and-network",
    variables: {
      request: {
        entityTypeIds: uniqueProposedEntityTypeSets,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeResolved: "resolvedWithDataTypeChildren",
      },
    },
    skip: proposedEntities.length === 0,
  });

  const proposedEntitiesTypesInfo = useMemo(() => {
    if (!proposedEntitiesTypesData) {
      return previousProposedEntitiesTypesData
        ? {
            entityTypes:
              previousProposedEntitiesTypesData.getClosedMultiEntityTypes
                .entityTypes,
            definitions:
              previousProposedEntitiesTypesData.getClosedMultiEntityTypes
                .definitions,
          }
        : undefined;
    }

    return {
      entityTypes:
        proposedEntitiesTypesData.getClosedMultiEntityTypes.entityTypes,
      definitions:
        proposedEntitiesTypesData.getClosedMultiEntityTypes.definitions,
    };
  }, [proposedEntitiesTypesData, previousProposedEntitiesTypesData]);

  /**
   * Because proposed entities are not in the database, we need to use a custom SlideStackProvider,
   * so that when entities are clicked in the result table/graph, we can intercept the click and
   * build a mock subgraph to provide to the entity slide.
   *
   * This function rewrites the slide item to add the subgraph to proposed entities.
   *
   * @param item The slide item to potentially modify
   * @returns The modified slide item with a subgraph for proposed entities, or the original item for persisted entities
   */
  const rewriteSlideItemOverride = useCallback(
    (item: SlideItem): SlideItem => {
      if (item.kind !== "entity") {
        return item;
      }

      const selectedEntityId = item.itemId;

      const isPersistedEntity = persistedEntitiesMetadata.some(
        ({ entityId }) => entityId === selectedEntityId,
      );

      // If it's a persisted entity, no need to modify the slide item. The slide will get it from the database.
      if (isPersistedEntity) {
        return item;
      }

      const proposedEntity = proposedEntities.find(
        (entity) => entity.localEntityId === selectedEntityId,
      );

      if (!proposedEntity) {
        return item;
      }

      if (!proposedEntitiesTypesInfo) {
        return item;
      }

      const mockedEntity = mockEntityFromProposedEntity(proposedEntity);

      // Build a subgraph for the entity slide, which includes the entity and linked entities among the proposed entities
      const now = currentTimestamp();

      const mockSubgraph = buildSubgraph(
        {
          dataTypes: [],
          propertyTypes: [],
          entityTypes: [],
          entities: proposedEntities.map((entity) =>
            entity.localEntityId === selectedEntityId
              ? mockedEntity
              : mockEntityFromProposedEntity(entity),
          ),
        },
        [mockedEntity.metadata.recordId],
        {
          initial: currentTimeInstantTemporalAxes,
          resolved: {
            pinned: {
              axis: "transactionTime",
              timestamp: now,
            },
            variable: {
              axis: "decisionTime",
              interval: {
                start: {
                  kind: "inclusive",
                  limit: generateTimestamp(new Date(0)),
                },
                end: { kind: "inclusive", limit: now },
              },
            },
          },
        },
      ) as unknown as Subgraph<EntityRootType<HashEntity>>;

      return {
        ...item,
        proposedEntitySubgraph: mockSubgraph,
      };
    },
    [persistedEntitiesMetadata, proposedEntities, proposedEntitiesTypesInfo],
  );

  useEffect(() => {
    if (!hasClaims && visibleSection === "claims" && hasEntities) {
      setVisibleSection("entities");
    }
  }, [hasClaims, hasEntities, visibleSection]);

  const entitiesForGraph = useMemo<EntityForGraphChart[]>(() => {
    if (persistedEntities.length > 0) {
      return persistedEntities;
    }

    return proposedEntities.map((proposedEntity) => {
      const {
        entityTypeIds,
        localEntityId,
        properties,
        sourceEntityId,
        targetEntityId,
      } = proposedEntity;

      const editionId = new Date().toISOString() as EntityEditionId;

      return {
        linkData:
          sourceEntityId && targetEntityId
            ? {
                leftEntityId:
                  "localId" in sourceEntityId
                    ? sourceEntityId.localId
                    : sourceEntityId.entityId,
                rightEntityId:
                  "localId" in targetEntityId
                    ? targetEntityId.localId
                    : targetEntityId.entityId,
              }
            : undefined,
        metadata: {
          recordId: {
            editionId,
            entityId: localEntityId,
          },
          entityTypeIds,
        },
        properties,
      };
    });
  }, [persistedEntities, proposedEntities]);

  return (
    <SlideStackProvider rewriteSlideItemOverride={rewriteSlideItemOverride}>
      <Box position="relative">
        <Stack
          alignItems="center"
          direction="row"
          justifyContent="space-between"
          sx={{ top: 5, position: "relative", zIndex: 0 }}
        >
          <SectionTabContainer>
            {(hasClaims
              ? (["entities", "claims", "deliverables"] as const)
              : (["entities", "deliverables"] as const)
            ).map((section) => (
              <SectionTabButton
                color="white"
                height={34}
                key={section}
                additionalControlElements={
                  section === "entities" ? (
                    <Stack
                      direction="row"
                      alignItems="center"
                      sx={{
                        background: ({ palette }) => palette.blue[20],
                        borderRadius: 16,
                      }}
                    >
                      {(["graph", "table"] as const).map((option) => (
                        <SectionTabButton
                          color="blue"
                          height={30}
                          key={option}
                          label={option}
                          active={entityDisplay === option}
                          Icon={
                            entityDisplay === option
                              ? CheckRegularIcon
                              : outputIcons[option]
                          }
                          onClick={() => setEntityDisplay(option)}
                        />
                      ))}
                    </Stack>
                  ) : undefined
                }
                Icon={outputIcons[section]}
                label={section}
                active={section === visibleSection}
                onClick={() => setVisibleSection(section)}
              />
            ))}
          </SectionTabContainer>
        </Stack>
      </Box>
      <Stack
        alignItems="center"
        direction="row"
        flex={1}
        gap={1}
        sx={{
          maxWidth: "100%",
          overflowX: "auto",
          zIndex: 2,
        }}
      >
        {visibleSection === "entities" &&
          (entityDisplay === "table" ? (
            <EntityResultTable
              dataIsLoading={
                hasEntities &&
                !persistedEntitiesSubgraph &&
                !proposedEntitiesTypesInfo
              }
              persistedEntitiesWithOperation={persistedEntitiesWithOperation}
              persistedEntitiesSubgraph={persistedEntitiesSubgraph}
              persistedEntitiesTypesInfo={persistedEntitiesTypesInfo}
              proposedEntities={proposedEntities}
              proposedEntitiesTypesInfo={proposedEntitiesTypesInfo}
              relevantEntityIds={relevantEntityIds}
            />
          ) : (
            <EntityResultGraph
              closedMultiEntityTypesRootMap={
                persistedEntitiesTypesInfo?.entityTypes ??
                proposedEntitiesTypesInfo?.entityTypes
              }
              entities={entitiesForGraph}
            />
          ))}
        {visibleSection === "claims" && (
          <ClaimsOutput proposedEntities={proposedEntities} />
        )}
        {visibleSection === "deliverables" && (
          <Deliverables deliverables={deliverables} />
        )}
      </Stack>
    </SlideStackProvider>
  );
};
