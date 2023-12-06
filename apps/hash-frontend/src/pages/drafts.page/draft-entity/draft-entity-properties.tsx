import { useMutation } from "@apollo/client";
import {
  Entity,
  EntityRevisionId,
  EntityRootType,
  Subgraph,
} from "@local/hash-subgraph";
import { Box } from "@mui/material";
import { debounce } from "lodash";
import { FunctionComponent, useMemo, useState } from "react";

import {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../graphql/api-types.gen";
import { updateEntityMutation } from "../../../graphql/queries/knowledge/entity.queries";
import { EntityEditorContextProvider } from "../../[shortname]/entities/[entity-uuid].page/entity-editor/entity-editor-context";
import { PropertiesSection } from "../../[shortname]/entities/[entity-uuid].page/entity-editor/properties-section";

export const DraftEntityProperties: FunctionComponent<{
  initialEntity: Entity;
  subgraph: Subgraph<EntityRootType>;
}> = ({ initialEntity, subgraph }) => {
  const [isDirty, setIsDirty] = useState(false);

  const [entity, setEntity] = useState<Entity>(initialEntity);

  const entitySubgraph = useMemo<Subgraph<EntityRootType>>(
    () => ({
      ...subgraph,
      roots: [
        {
          baseId: entity.metadata.recordId.entityId,
          revisionId: entity.metadata.temporalVersioning.decisionTime.start
            .limit as EntityRevisionId,
        },
      ],
      vertices: {
        ...subgraph.vertices,
        [entity.metadata.recordId.entityId]: {
          ...subgraph.vertices[entity.metadata.recordId.entityId],
          [entity.metadata.temporalVersioning.decisionTime.start.limit]: {
            kind: "entity",
            inner: entity,
          },
        },
      },
    }),
    [subgraph, entity],
  );

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const debouncedUpdateEntity = useMemo(
    () =>
      debounce(
        (updatedEntity: Entity) =>
          updateEntity({
            variables: {
              entityId: updatedEntity.metadata.recordId.entityId,
              updatedProperties: updatedEntity.properties,
            },
          }),
        1000,
      ),
    [updateEntity],
  );

  const handleEntityChange = (updatedEntity: Entity) => {
    setIsDirty(true);
    setEntity(updatedEntity);
    void debouncedUpdateEntity(updatedEntity);
  };

  return (
    <Box marginTop={3}>
      <EntityEditorContextProvider
        readonly={false}
        entitySubgraph={entitySubgraph}
        replaceWithLatestDbVersion={async () => {}}
        setEntity={handleEntityChange}
        isDirty={isDirty}
        draftLinksToCreate={[]}
        setDraftLinksToCreate={() => {}}
        draftLinksToArchive={[]}
        setDraftLinksToArchive={() => {}}
      >
        <PropertiesSection hideSectionHeading />
      </EntityEditorContextProvider>
    </Box>
  );
};
