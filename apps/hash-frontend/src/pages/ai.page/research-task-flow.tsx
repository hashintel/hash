import { useMutation } from "@apollo/client";
import { TextField } from "@hashintel/design-system";
import { researchTaskFlowDefinition } from "@local/hash-isomorphic-utils/flows/example-flow-definitions";
import type { RunFlowWorkflowResponse } from "@local/hash-isomorphic-utils/flows/temporal-types";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { Entity, EntityTypeWithMetadata } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import { Box, InputLabel, Typography } from "@mui/material";
import type { FormEvent, FunctionComponent } from "react";
import { useCallback, useState } from "react";

import type {
  StartFlowMutation,
  StartFlowMutationVariables,
} from "../../graphql/api-types.gen";
import { startFlowMutation } from "../../graphql/queries/knowledge/entity.queries";
import { Button, Link } from "../../shared/ui";
import { EntityTypeSelector } from "../shared/entity-type-selector";
import { useEntityHref } from "../shared/use-entity-href";
import { SectionContainer } from "./shared/section-container";

const EntityListItem: FunctionComponent<{
  persistedEntity: Entity;
}> = ({ persistedEntity }) => {
  const href = useEntityHref(persistedEntity, true);

  return (
    <Typography component="li" sx={{ marginBottom: 2 }}>
      <Link href={href}>{persistedEntity.metadata.recordId.entityId}</Link>
      <Typography component="ul" sx={{ marginLeft: 3 }}>
        <Typography component="li">
          Properties:{" "}
          <Typography component="ul" sx={{ marginLeft: 3 }}>
            {Object.entries(persistedEntity.properties).map(([key, value]) => (
              <Typography component="li" key={key}>
                {key}: {stringifyPropertyValue(value)}
              </Typography>
            ))}
          </Typography>
        </Typography>
      </Typography>
    </Typography>
  );
};

const EntitiesList: FunctionComponent<{
  persistedEntities: Entity[];
}> = ({ persistedEntities }) => (
  <Typography component="ul" sx={{ marginLeft: 3 }}>
    {persistedEntities.map((persistedEntity) => (
      <EntityListItem
        key={persistedEntity.metadata.recordId.entityId}
        persistedEntity={persistedEntity}
      />
    ))}
  </Typography>
);

export const ResearchTaskFlow: FunctionComponent = () => {
  const [startFlow, { loading }] = useMutation<
    StartFlowMutation,
    StartFlowMutationVariables
  >(startFlowMutation);

  const [entityType, setEntityType] = useState<EntityTypeWithMetadata>();
  const [prompt, setPrompt] = useState<string>("");

  const [persistedEntities, setPersistedEntities] = useState<Entity[]>();

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      if (entityType && prompt) {
        setPersistedEntities(undefined);

        const { data } = await startFlow({
          variables: {
            flowDefinition: researchTaskFlowDefinition,
            flowTrigger: {
              triggerDefinitionId: "userTrigger",
              outputs: [
                {
                  outputName: "prompt",
                  payload: {
                    kind: "Text",
                    value: prompt,
                  },
                },
                {
                  outputName: "entityTypeIds",
                  payload: {
                    kind: "VersionedUrl",
                    value: [entityType.schema.$id],
                  },
                },
              ],
            },
          },
        });

        if (data) {
          const status = data.startFlow as RunFlowWorkflowResponse;

          if (status.code === StatusCode.Ok) {
            const entities = status.contents[0]?.flowOutputs?.[0]?.payload
              ?.value as Entity[] | undefined;

            if (!entities) {
              throw new Error(
                "Status code 'Ok' but no persisted entities in payload",
              );
            }

            setPersistedEntities(entities);
          } else {
            throw new Error(status.message ?? "No error message");
          }
        }
      }
    },
    [entityType, prompt, startFlow],
  );

  return (
    <SectionContainer>
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          display: "flex",
          flexDirection: "column",
          rowGap: 2,
        }}
      >
        <Typography variant="h5" sx={{ color: ({ palette }) => palette.black }}>
          What is your goal?
        </Typography>
        <Box>
          <InputLabel>
            <Box
              component="span"
              sx={{ color: ({ palette }) => palette.black, fontWeight: 600 }}
            >
              Find and add...
            </Box>
          </InputLabel>
          <EntityTypeSelector
            onSelect={(selectedEntityType) => setEntityType(selectedEntityType)}
            disableCreateNewEmpty
            autoFocus={false}
          />
        </Box>
        <Box>
          <InputLabel>
            <Box
              component="span"
              sx={{ color: ({ palette }) => palette.black, fontWeight: 600 }}
            >
              Look for and add...
            </Box>{" "}
            <Box
              component="span"
              sx={{
                color: ({ palette }) => palette.gray[70],
                fontWeight: 600,
              }}
            >
              e.g. specific things to include, focus on, or pay attention to
            </Box>
          </InputLabel>
          <TextField
            placeholder="Tell the AI what to look for"
            value={prompt}
            onChange={({ target }) => setPrompt(target.value)}
            sx={{
              width: "100%",
              maxWidth: 440,
            }}
          />
        </Box>

        <Button type="submit" sx={{ maxWidth: 440 }}>
          Start Research Task
        </Button>
        {loading ? <Typography>Loading...</Typography> : null}
        {persistedEntities ? (
          <>
            <Typography>Created entities:</Typography>
            <EntitiesList persistedEntities={persistedEntities} />
          </>
        ) : null}
      </Box>
    </SectionContainer>
  );
};
