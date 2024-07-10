import { useQuery } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system";
import { IconButton } from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { Filter } from "@local/hash-graph-client";
import { Entity } from "@local/hash-graph-sdk/entity";
import type {
  PersistedEntity,
  ProposedEntity,
} from "@local/hash-isomorphic-utils/flows/types";
import {
  currentTimeInstantTemporalAxes,
  fullOntologyResolveDepths,
  generateVersionedUrlMatchingFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { deserializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import { isNotNullish } from "@local/hash-isomorphic-utils/types";
import type { EntityRootType, EntityTypeRootType } from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import type { SvgIconProps } from "@mui/material";
import { Box, Stack, Typography } from "@mui/material";
import type { FunctionComponent } from "react";
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
import { EntityResultTable } from "./outputs/entity-result-table";
import { PersistedEntityGraph } from "./outputs/persisted-entity-graph";
import { outputIcons } from "./outputs/shared/icons";
import { flowSectionBorderRadius } from "./shared/styles";

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

const VisibilityButton = ({
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
        ml: 0.8,
        textTransform: "capitalize",
        transition: ({ transitions }) => transitions.create("color"),
      }}
    >
      {label}
    </Typography>
  </IconButton>
);

type ResultSlideOver =
  | {
      type: "entity";
      entity: Entity;
    }
  | {
      type: "entityType";
      entityTypeId: VersionedUrl;
    }
  | null;

type OutputsProps = {
  persistedEntities: PersistedEntity[];
  proposedEntities: Omit<ProposedEntity, "provenance" | "propertyMetadata">[];
};

type SectionVisibility = {
  deliverables: boolean;
  graph: boolean;
  table: boolean;
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

  const [selectedSection, setSelectedSection] = useState<"table" | "graph">(
    "table",
  );

  const [sectionVisibility, setSectionVisibility] = useState<SectionVisibility>(
    {
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
          generateVersionedUrlMatchingFilter(proposedEntity.entityTypeId),
        ),
      },
      ...fullOntologyResolveDepths,
    },
    skip: proposedEntities.length === 0,
  });

  const proposedEntitiesTypesById = useMemo(() => {
    if (!proposedEntitiesTypesData) {
      return {};
    }

    const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<EntityTypeRootType>(
      proposedEntitiesTypesData.queryEntityTypes,
    );

    const entityTypes = getRoots(subgraph);

    return Object.groupBy(entityTypes, (entityType) => entityType.schema.$id);
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
    const defaultEntity = persistedEntities[0]?.entity
      ? new Entity(persistedEntities[0].entity)
      : undefined;

    const selectedEntity =
      slideOver?.type === "entity" ? slideOver.entity : defaultEntity;

    if (!persistedEntitiesSubgraph || !selectedEntity) {
      return undefined;
    }

    return generateEntityRootedSubgraph(
      selectedEntity,
      persistedEntitiesSubgraph,
    );
  }, [persistedEntities, persistedEntitiesSubgraph, slideOver]);

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
          open={slideOver?.type === "entity"}
          onClose={() => setSlideOver(null)}
          onSubmit={() => {
            throw new Error("Editing not permitted in this context");
          }}
          readonly
        />
      )}
      <Stack alignItems="center" direction="row" justifyContent="space-between">
        <Box />
        <Stack
          alignItems="center"
          direction="row"
          gap={0.5}
          py={0.9}
          px={1}
          sx={{
            background: ({ palette }) => palette.gray[20],
            borderTopRightRadius: flowSectionBorderRadius,
            borderTopLeftRadius: flowSectionBorderRadius,
          }}
        >
          {(["graph", "table"] as const).map((section) => (
            <VisibilityButton
              key={section}
              label={section}
              active={selectedSection === section}
              Icon={outputIcons[section]}
              onClick={() => setSelectedSection(section)}
            />
          ))}
        </Stack>
      </Stack>
      <Stack
        alignItems="center"
        direction="row"
        flex={1}
        gap={1}
        sx={{
          maxWidth: "100%",
          overflowX: "auto",
        }}
      >
        {selectedSection === "table" ? (
          <EntityResultTable
            onEntityClick={(entity) => setSlideOver({ type: "entity", entity })}
            onEntityTypeClick={(entityTypeId) =>
              setSlideOver({ type: "entityType", entityTypeId })
            }
            persistedEntities={persistedEntities}
            persistedEntitiesSubgraph={persistedEntitiesSubgraph}
            proposedEntities={proposedEntities}
            proposedEntitiesTypesById={proposedEntitiesTypesById}
          />
        ) : (
          <PersistedEntityGraph
            onEntityClick={(entity) => setSlideOver({ type: "entity", entity })}
            persistedEntities={persistedEntities}
            persistedEntitiesSubgraph={persistedEntitiesSubgraph}
          />
        )}

        {sectionVisibility.deliverables && (
          <Deliverables deliverables={deliverables} />
        )}
      </Stack>
    </>
  );
};
