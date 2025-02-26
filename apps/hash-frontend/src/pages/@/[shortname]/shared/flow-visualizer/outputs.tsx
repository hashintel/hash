import { useQuery } from "@apollo/client";
import { buildSubgraph } from "@blockprotocol/graph/stdlib";
import type { EntityForGraphChart } from "@hashintel/block-design-system";
import { CheckRegularIcon, IconButton } from "@hashintel/design-system";
import type {
  Entity as GraphApiEntity,
  Filter,
  LeftClosedTemporalInterval,
} from "@local/hash-graph-client";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId, EntityUuid } from "@local/hash-graph-types/entity";
import { goalFlowDefinitionIds } from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import type { PersistedEntity } from "@local/hash-isomorphic-utils/flows/types";
import {
  currentTimeInstantTemporalAxes,
  fullOntologyResolveDepths,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { deserializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import { isNotNullish } from "@local/hash-isomorphic-utils/types";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import {
  getDataTypes,
  getEntityTypes,
  getPropertyTypes,
} from "@local/hash-subgraph/stdlib";
import type { SvgIconProps } from "@mui/material";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import type { FunctionComponent, PropsWithChildren, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  FlowRun,
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../../../../graphql/queries/knowledge/entity.queries";
import { queryEntityTypesQuery } from "../../../../../graphql/queries/ontology/entity-type.queries";
import { useFlowRunsContext } from "../../../../shared/flow-runs-context";
import { getFileProperties } from "../../../../shared/get-file-properties";
import { useSlideStack } from "../../../../shared/slide-stack";
import { ClaimsOutput } from "./outputs/claims-output";
import { Deliverables } from "./outputs/deliverables";
import type { DeliverableData } from "./outputs/deliverables/shared/types";
import { EntityResultGraph } from "./outputs/entity-result-graph";
import { EntityResultTable } from "./outputs/entity-result-table";
import { outputIcons } from "./outputs/shared/icons";
import { flowSectionBorderRadius } from "./shared/styles";
import type { ProposedEntityOutput } from "./shared/types";

export const getDeliverables = (
  outputs?: FlowRun["outputs"],
): DeliverableData[] => {
  const flowOutputs = outputs?.[0]?.contents?.[0]?.outputs;

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
    if (payload.kind === "PersistedEntity" && !Array.isArray(payload.value)) {
      if (!payload.value.entity) {
        continue;
      }
      const entity = new Entity(payload.value.entity);

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
): Entity => {
  const editionId = new Date().toISOString();

  const temporalInterval: LeftClosedTemporalInterval = {
    start: { kind: "inclusive", limit: editionId },
    end: { kind: "unbounded" },
  };

  const { sourceEntityId, targetEntityId } = proposedEntity;

  return new Entity({
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
        createdById: "ownedById",
        edition: {
          createdById: "ownedById",
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
  persistedEntities: PersistedEntity[];
  proposedEntities: ProposedEntityOutput[];
  relevantEntityIds: EntityId[];
};

export const Outputs = ({
  persistedEntities,
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
    persistedEntities.length > 0 || proposedEntities.length > 0;

  const deliverables = useMemo(
    () => getDeliverables(selectedFlowRun?.outputs),
    [selectedFlowRun],
  );

  const [entityDisplay, setEntityDisplay] = useState<"table" | "graph">(
    "table",
  );

  const [visibleSection, setVisibleSection] = useState<
    "claims" | "entities" | "deliverables"
  >(hasEntities ? "entities" : "claims");

  const persistedEntitiesFilter = useMemo<Filter>(
    () => ({
      any: persistedEntities
        .map((persistedEntity) => {
          if (!persistedEntity.entity) {
            return null;
          }

          const entity = new Entity(persistedEntity.entity);
          return {
            equal: [
              { path: ["uuid"] },
              {
                parameter: extractEntityUuidFromEntityId(
                  entity.metadata.recordId.entityId,
                ),
              },
            ],
          };
        })
        .filter(isNotNullish),
    }),
    [persistedEntities],
  );

  const {
    data: proposedEntitiesTypesData,
    previousData: previousProposedEntitiesTypesData,
  } = useQuery<QueryEntityTypesQuery, QueryEntityTypesQueryVariables>(
    queryEntityTypesQuery,
    {
      fetchPolicy: "cache-and-network",
      variables: {
        filter: {
          any: [
            ...new Set(
              proposedEntities.flatMap(
                (proposedEntity) => proposedEntity.entityTypeIds,
              ),
            ),
          ].map((entityTypeId) =>
            generateVersionedUrlMatchingFilter(entityTypeId, {
              forEntityType: true,
            }),
          ),
        },
        ...fullOntologyResolveDepths,
      },
      skip: proposedEntities.length === 0,
    },
  );

  const proposedEntitiesTypesSubgraph = useMemo(() => {
    if (!proposedEntitiesTypesData) {
      return previousProposedEntitiesTypesData
        ? deserializeSubgraph(
            previousProposedEntitiesTypesData.queryEntityTypes,
          )
        : undefined;
    }

    return deserializeSubgraph(proposedEntitiesTypesData.queryEntityTypes);
  }, [proposedEntitiesTypesData, previousProposedEntitiesTypesData]);

  const {
    data: persistedEntitiesSubgraphData,
    previousData: previousPersistedEntitiesSubgraphData,
  } = useQuery<GetEntitySubgraphQuery, GetEntitySubgraphQueryVariables>(
    getEntitySubgraphQuery,
    {
      variables: {
        includePermissions: false,
        request: {
          filter: persistedEntitiesFilter,
          graphResolveDepths: {
            ...zeroedGraphResolveDepths,
            ...fullOntologyResolveDepths,
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts: true,
        },
      },
      skip: !persistedEntities.length,
      fetchPolicy: "network-only",
    },
  );

  const persistedEntitiesSubgraph = useMemo(() => {
    if (!persistedEntitiesSubgraphData) {
      return previousPersistedEntitiesSubgraphData
        ? deserializeSubgraph<EntityRootType>(
            previousPersistedEntitiesSubgraphData.getEntitySubgraph.subgraph,
          )
        : undefined;
    }

    return deserializeSubgraph<EntityRootType>(
      persistedEntitiesSubgraphData.getEntitySubgraph.subgraph,
    );
  }, [persistedEntitiesSubgraphData, previousPersistedEntitiesSubgraphData]);

  const { pushToSlideStack } = useSlideStack();

  const handleEntityClick = useCallback(
    (selectedEntityId: EntityId) => {
      if (!selectedFlowRun?.webId) {
        return undefined;
      }

      const persistedEntity = persistedEntities.find(
        ({ entity }) =>
          entity &&
          new Entity(entity).metadata.recordId.entityId === selectedEntityId,
      );

      if (persistedEntity) {
        pushToSlideStack({
          kind: "entity",
          itemId: selectedEntityId,
        });
        return;
      }

      const proposedEntity = proposedEntities.find(
        (entity) => entity.localEntityId === selectedEntityId,
      );

      if (proposedEntity) {
        if (!proposedEntitiesTypesSubgraph) {
          return undefined;
        }

        const mockedEntity = mockEntityFromProposedEntity(proposedEntity);

        const entityTypes = getEntityTypes(proposedEntitiesTypesSubgraph);
        const propertyTypes = getPropertyTypes(proposedEntitiesTypesSubgraph);
        const dataTypes = getDataTypes(proposedEntitiesTypesSubgraph);

        const now = new Date().toISOString();

        const mockSubgraph = buildSubgraph(
          {
            dataTypes,
            propertyTypes,
            entityTypes,

            /**
             * @todo H-3162: also handle proposed entities which link to existing persisted entities
             *   -- requires having fetched them.
             */
            entities: proposedEntities.map((entity) =>
              entity.localEntityId === selectedEntityId
                ? mockedEntity
                : mockEntityFromProposedEntity(entity),
            ),
          },
          [mockedEntity.metadata.recordId],
          {
            ...fullOntologyResolveDepths,
            hasLeftEntity: {
              outgoing: 1,
              incoming: 1,
            },
            hasRightEntity: {
              outgoing: 1,
              incoming: 1,
            },
          },
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
                    limit: new Date(0).toISOString(),
                  },
                  end: { kind: "inclusive", limit: now },
                },
              },
            },
          },
        ) as unknown as Subgraph<EntityRootType>;

        pushToSlideStack({
          kind: "entity",
          itemId: selectedEntityId,
          proposedEntitySubgraph: mockSubgraph,
        });
      }
    },
    [
      persistedEntities,
      proposedEntitiesTypesSubgraph,
      proposedEntities,
      pushToSlideStack,
      selectedFlowRun?.webId,
    ],
  );

  useEffect(() => {
    if (!hasClaims && visibleSection === "claims" && hasEntities) {
      setVisibleSection("entities");
    }
  }, [hasClaims, hasEntities, visibleSection]);

  const entitiesForGraph = useMemo<EntityForGraphChart[]>(() => {
    const entities: EntityForGraphChart[] = [];

    if (persistedEntities.length > 0) {
      for (const { entity } of persistedEntities) {
        if (!entity) {
          continue;
        }
        entities.push(new Entity(entity));
      }
      return entities;
    }

    for (const entity of proposedEntities) {
      const {
        entityTypeIds,
        localEntityId,
        properties,
        sourceEntityId,
        targetEntityId,
      } = entity;

      const editionId = new Date().toISOString();

      entities.push({
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
      });
    }
    return entities;
  }, [persistedEntities, proposedEntities]);

  return (
    <>
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
                !proposedEntitiesTypesSubgraph
              }
              onEntityClick={handleEntityClick}
              onEntityTypeClick={(entityTypeId) => {
                pushToSlideStack({
                  kind: "entityType",
                  itemId: entityTypeId,
                });
              }}
              persistedEntities={persistedEntities}
              persistedEntitiesSubgraph={persistedEntitiesSubgraph}
              proposedEntities={proposedEntities}
              proposedEntitiesTypesSubgraph={proposedEntitiesTypesSubgraph}
              relevantEntityIds={relevantEntityIds}
            />
          ) : (
            <EntityResultGraph
              onEntityClick={handleEntityClick}
              onEntityTypeClick={(entityTypeId) => {
                pushToSlideStack({
                  kind: "entityType",
                  itemId: entityTypeId,
                });
              }}
              entities={entitiesForGraph}
              subgraphWithTypes={
                persistedEntitiesSubgraph ?? proposedEntitiesTypesSubgraph
              }
            />
          ))}
        {visibleSection === "claims" && (
          <ClaimsOutput
            onEntityClick={handleEntityClick}
            proposedEntities={proposedEntities}
          />
        )}
        {visibleSection === "deliverables" && (
          <Deliverables deliverables={deliverables} />
        )}
      </Stack>
    </>
  );
};
