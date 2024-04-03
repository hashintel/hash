import { useMutation } from "@apollo/client";
import { TextField } from "@hashintel/design-system";
import type { EntityWithSources } from "@local/hash-isomorphic-utils/research-task-types";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { EntityTypeWithMetadata } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import { Box, Container, InputLabel, Typography } from "@mui/material";
import type { FormEvent, FunctionComponent } from "react";
import { useCallback, useState } from "react";

import type {
  StartResearchTaskMutation,
  StartResearchTaskMutationVariables,
} from "../../graphql/api-types.gen";
import { startResearchTaskMutation } from "../../graphql/queries/knowledge/entity.queries";
import { Button, Link } from "../../shared/ui";
import { EntityTypeSelector } from "../shared/entity-type-selector";
import { useEntityHref } from "../shared/use-entity-href";

const EntityListItem: FunctionComponent<{
  entityWithSources: EntityWithSources;
}> = ({ entityWithSources }) => {
  const { entity, sourceWebPages } = entityWithSources;
  const href = useEntityHref(entity, true);

  return (
    <Typography component="li" sx={{ marginBottom: 2 }}>
      <Link href={href}>{entity.metadata.recordId.entityId}</Link>
      <Typography component="ul" sx={{ marginLeft: 3 }}>
        <Typography component="li">
          Sources:
          <Typography component="ul" sx={{ marginLeft: 3 }}>
            {sourceWebPages.map((sourceWebPage) => (
              <Typography component="li" key={sourceWebPage.url}>
                <Link href={sourceWebPage.url}>{sourceWebPage.title}</Link>
              </Typography>
            ))}
          </Typography>
        </Typography>
        <Typography component="li">
          Properties:{" "}
          <Typography component="ul" sx={{ marginLeft: 3 }}>
            {Object.entries(entity.properties).map(([key, value]) => (
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
  entitiesWithSources: EntityWithSources[];
}> = ({ entitiesWithSources }) => (
  <Typography component="ul" sx={{ marginLeft: 3 }}>
    {entitiesWithSources.map((entityWithSources) => (
      <EntityListItem
        key={entityWithSources.entity.metadata.recordId.entityId}
        entityWithSources={entityWithSources}
      />
    ))}
  </Typography>
);

export const AiWorkerPageContent: FunctionComponent = () => {
  const [startResearchTask, { loading }] = useMutation<
    StartResearchTaskMutation,
    StartResearchTaskMutationVariables
  >(startResearchTaskMutation);

  const [entityType, setEntityType] = useState<EntityTypeWithMetadata>();
  const [prompt, setPrompt] = useState<string>("");

  const [createdDraftEntities, setCreatedDraftEntities] =
    useState<EntityWithSources[]>();
  const [unchangedExistingEntities, setUnchangedExistingEntities] =
    useState<EntityWithSources[]>();

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      if (entityType && prompt) {
        setCreatedDraftEntities(undefined);
        setUnchangedExistingEntities(undefined);

        const { data } = await startResearchTask({
          variables: {
            entityTypeIds: [entityType.schema.$id],
            prompt,
          },
        });

        if (data) {
          const status = data.startResearchTask;

          if (status.code === StatusCode.Ok) {
            setCreatedDraftEntities(status.contents[0]!.createdDraftEntities);
            setUnchangedExistingEntities(
              status.contents[0]!.unchangedExistingEntities,
            );
          }
        }
      }
    },
    [entityType, prompt, startResearchTask],
  );

  return (
    <Container>
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          display: "flex",
          flexDirection: "column",
          rowGap: 2,
          width: "100%",
          borderRadius: "8px",
          borderColor: ({ palette }) => palette.gray[30],
          borderWidth: 1,
          borderStyle: "solid",
          background: ({ palette }) => palette.common.white,
          paddingX: 4.5,
          paddingY: 3.25,
          marginTop: 3,
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
        {createdDraftEntities ? (
          <>
            <Typography>Created Draft entities:</Typography>
            <EntitiesList entitiesWithSources={createdDraftEntities} />
          </>
        ) : null}
        {unchangedExistingEntities ? (
          <>
            <Typography>Unchanged Existing entities:</Typography>
            <EntitiesList entitiesWithSources={unchangedExistingEntities} />
          </>
        ) : null}
      </Box>
    </Container>
  );
};
