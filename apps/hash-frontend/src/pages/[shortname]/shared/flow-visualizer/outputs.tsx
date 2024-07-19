import { useQuery } from "@apollo/client";
import { buildSubgraph } from "@blockprotocol/graph/stdlib";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { EntityForGraphChart } from "@hashintel/block-design-system";
import { IconButton } from "@hashintel/design-system";
import type {
  Entity as GraphApiEntity,
  Filter,
  LeftClosedTemporalInterval,
} from "@local/hash-graph-client";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId, EntityUuid } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
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
import { entityIdFromComponents } from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import {
  getDataTypes,
  getEntityTypes,
  getPropertyTypes,
} from "@local/hash-subgraph/stdlib";
import type { SvgIconProps } from "@mui/material";
import { Box, Stack, Typography } from "@mui/material";
import type { FunctionComponent, PropsWithChildren } from "react";
import { useMemo, useState } from "react";

import type {
  FlowRun,
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { queryEntityTypesQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import { TypeSlideOverStack } from "../../../shared/entity-type-page/type-slide-over-stack";
import { useFlowRunsContext } from "../../../shared/flow-runs-context";
import { getFileProperties } from "../../../shared/get-file-properties";
import { generateEntityRootedSubgraph } from "../../../shared/subgraphs";
import { EditEntitySlideOver } from "../../entities/[entity-uuid].page/edit-entity-slide-over";
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
          entityTypeId: entity.metadata.entityTypeId,
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
  label,
  Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  Icon: FunctionComponent<SvgIconProps>;
  onClick: () => void;
}) => (
  <IconButton
    onClick={onClick}
    sx={({ palette }) => ({
      background: active ? palette.common.white : palette.gray[20],
      borderRadius: 16,
      px: 1.2,
      py: 0.8,
      svg: {
        fontSize: 14,
      },
      "&:hover": {
        background: active ? palette.common.white : palette.gray[20],
      },
      transition: ({ transitions }) => transitions.create("background"),
    })}
  >
    <Icon
      sx={({ palette }) => ({
        color: active ? palette.common.black : palette.gray[80],
        display: "block",
      })}
    />

    <Typography
      component="span"
      sx={{
        color: ({ palette }) =>
          active ? palette.common.black : palette.gray[80],
        fontSize: 13,
        fontWeight: 500,
        ml: 1,
        textTransform: "capitalize",
        transition: ({ transitions }) => transitions.create("color"),
      }}
    >
      {label}
    </Typography>
  </IconButton>
);

const mockEntityFromProposedEntity = (
  proposedEntity: ProposedEntityOutput,
  webId: OwnedById,
): Entity => {
  const editionId = new Date().toISOString();

  const temporalInterval: LeftClosedTemporalInterval = {
    start: { kind: "inclusive", limit: editionId },
    end: { kind: "unbounded" },
  };

  return new Entity({
    metadata: {
      recordId: {
        entityId: entityIdFromComponents(
          webId,
          proposedEntity.localEntityId as EntityUuid,
        ),
        editionId,
      },
      entityTypeIds: [proposedEntity.entityTypeId],
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
        },
      },
    },
    properties: proposedEntity.properties,
  } satisfies GraphApiEntity);
};

type ResultSlideOver =
  | {
      type: "entity";
      entityId: EntityId;
    }
  | {
      type: "entityType";
      entityTypeId: VersionedUrl;
    }
  | null;

type OutputsProps = {
  persistedEntities: PersistedEntity[];
  proposedEntities: ProposedEntityOutput[];
};

type SectionVisibility = {
  deliverables: boolean;
  entities: boolean;
};

export const Outputs = ({
  persistedEntities,
  proposedEntities,
}: OutputsProps) => {
  const { selectedFlowRun } = useFlowRunsContext();

  const deliverables = useMemo(
    () => getDeliverables(selectedFlowRun?.outputs),
    [selectedFlowRun],
  );

  const [entityDisplay, setEntityDisplay] = useState<"table" | "graph">(
    "table",
  );

  const [sectionVisibility, setSectionVisibility] = useState<SectionVisibility>(
    {
      entities: true,
      deliverables: false,
    },
  );

  const [slideOver, setSlideOver] = useState<ResultSlideOver>(null);

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

  const { data: proposedEntitiesTypesData } = useQuery<
    QueryEntityTypesQuery,
    QueryEntityTypesQueryVariables
  >(queryEntityTypesQuery, {
    fetchPolicy: "cache-and-network",
    variables: {
      filter: {
        any: proposedEntities.map((proposedEntity) =>
          generateVersionedUrlMatchingFilter(proposedEntity.entityTypeId, {
            forEntityType: true,
          }),
        ),
      },
      ...fullOntologyResolveDepths,
    },
    skip: proposedEntities.length === 0,
  });

  const proposedEntitiesTypesSubgraph = useMemo(() => {
    if (!proposedEntitiesTypesData) {
      return undefined;
    }

    return deserializeSubgraph(proposedEntitiesTypesData.queryEntityTypes);
  }, [proposedEntitiesTypesData]);

  const { data: entitiesSubgraphData } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
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
  });

  const persistedEntitiesSubgraph = useMemo(() => {
    if (!entitiesSubgraphData) {
      return undefined;
    }

    return deserializeSubgraph<EntityRootType>(
      entitiesSubgraphData.getEntitySubgraph.subgraph,
    );
  }, [entitiesSubgraphData]);

  const selectedEntitySubgraph = useMemo(() => {
    const selectedEntityId =
      slideOver?.type === "entity" ? slideOver.entityId : undefined;

    if (!selectedEntityId || !selectedFlowRun?.webId) {
      return undefined;
    }

    const proposedEntity = proposedEntities.find(
      (entity) =>
        entity.localEntityId ===
        extractEntityUuidFromEntityId(selectedEntityId),
    );

    if (proposedEntity) {
      if (!proposedEntitiesTypesSubgraph) {
        return undefined;
      }

      const mockedEntity = mockEntityFromProposedEntity(
        proposedEntity,
        selectedFlowRun.webId,
      );

      /**
       * @todo also handle proposed entities which link to existing persisted entities
       *   -- requires having fetched them.
       */
      const linkedEntities = proposedEntities
        .filter(
          (entity) =>
            (entity.sourceEntityId?.kind === "proposed-entity" &&
              entity.sourceEntityId.localId === selectedEntityId) ||
            (entity.targetEntityId?.kind === "proposed-entity" &&
              entity.targetEntityId.localId === selectedEntityId),
        )
        .map((linkedEntity) =>
          mockEntityFromProposedEntity(linkedEntity, selectedFlowRun.webId),
        );

      const entityTypes = getEntityTypes(proposedEntitiesTypesSubgraph);
      const propertyTypes = getPropertyTypes(proposedEntitiesTypesSubgraph);
      const dataTypes = getDataTypes(proposedEntitiesTypesSubgraph);

      const now = new Date().toISOString();

      const mockSubgraph = buildSubgraph(
        {
          dataTypes,
          propertyTypes,
          entityTypes,
          entities: [mockedEntity, ...linkedEntities],
        },
        [mockedEntity.metadata.recordId],
        {
          ...fullOntologyResolveDepths,
          hasLeftEntity: {
            outgoing: 0,
            incoming: 1,
          },
          hasRightEntity: {
            outgoing: 1,
            incoming: 0,
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
                start: { kind: "inclusive", limit: new Date(0).toISOString() },
                end: { kind: "inclusive", limit: now },
              },
            },
          },
        },
      ) as unknown as Subgraph<EntityRootType>;

      return mockSubgraph;
    }

    if (!persistedEntitiesSubgraph) {
      return undefined;
    }

    return generateEntityRootedSubgraph(
      selectedEntityId,
      persistedEntitiesSubgraph,
    );
  }, [
    persistedEntitiesSubgraph,
    proposedEntitiesTypesSubgraph,
    proposedEntities,
    selectedFlowRun?.webId,
    slideOver,
  ]);

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
        entityTypeId,
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
                    ? (sourceEntityId.localId as EntityId)
                    : sourceEntityId.entityId,
                rightEntityId:
                  "localId" in targetEntityId
                    ? (targetEntityId.localId as EntityId)
                    : targetEntityId.entityId,
              }
            : undefined,
        metadata: {
          recordId: {
            editionId,
            entityId: entityIdFromComponents(
              "ownedById" as OwnedById,
              localEntityId as EntityUuid,
            ),
          },
          entityTypeId,
        },
        properties,
      });
    }
    return entities;
  }, [persistedEntities, proposedEntities]);

  return (
    <>
      {slideOver?.type === "entityType" && (
        <TypeSlideOverStack
          rootTypeId={slideOver.entityTypeId}
          onClose={() => setSlideOver(null)}
        />
      )}
      {selectedEntitySubgraph && (
        <EditEntitySlideOver
          entitySubgraph={selectedEntitySubgraph}
          hideOpenInNew={persistedEntities.length === 0}
          open={slideOver?.type === "entity"}
          onClose={() => setSlideOver(null)}
          onSubmit={() => {
            throw new Error("Editing not permitted in this context");
          }}
          readonly
        />
      )}
      <Box position="relative">
        <Stack
          alignItems="center"
          direction="row"
          justifyContent="space-between"
          sx={{ top: 5, position: "relative", zIndex: 0 }}
        >
          <SectionTabContainer>
            {(["entities", "deliverables"] as const).map((section) => (
              <SectionTabButton
                key={section}
                label={section}
                active={sectionVisibility[section]}
                Icon={outputIcons[section]}
                onClick={() =>
                  setSectionVisibility({
                    ...sectionVisibility,
                    [section]: !sectionVisibility[section],
                  })
                }
              />
            ))}
          </SectionTabContainer>
          {sectionVisibility.entities && (
            <SectionTabContainer>
              {(["graph", "table"] as const).map((section) => (
                <SectionTabButton
                  key={section}
                  label={section}
                  active={entityDisplay === section}
                  Icon={outputIcons[section]}
                  onClick={() => setEntityDisplay(section)}
                />
              ))}
            </SectionTabContainer>
          )}
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
        {sectionVisibility.entities &&
          (entityDisplay === "table" ? (
            <EntityResultTable
              onEntityClick={(entityId) =>
                setSlideOver({ type: "entity", entityId })
              }
              onEntityTypeClick={(entityTypeId) =>
                setSlideOver({ type: "entityType", entityTypeId })
              }
              persistedEntities={persistedEntities}
              persistedEntitiesSubgraph={persistedEntitiesSubgraph}
              proposedEntities={proposedEntities}
              proposedEntitiesTypesSubgraph={proposedEntitiesTypesSubgraph}
            />
          ) : (
            <EntityResultGraph
              onEntityClick={(entityId) =>
                setSlideOver({
                  type: "entity",
                  entityId,
                })
              }
              onEntityTypeClick={(entityTypeId) =>
                setSlideOver({ type: "entityType", entityTypeId })
              }
              entities={entitiesForGraph}
              subgraphWithTypes={
                persistedEntitiesSubgraph ?? proposedEntitiesTypesSubgraph
              }
            />
          ))}

        {sectionVisibility.deliverables && (
          <Deliverables deliverables={deliverables} />
        )}
      </Stack>
    </>
  );
};
