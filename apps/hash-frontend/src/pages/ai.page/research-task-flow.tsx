import { useMutation } from "@apollo/client";
import { TextField } from "@hashintel/design-system";
import type {
  InputNameForAction,
  OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { RunFlowWorkflowResponse } from "@local/hash-isomorphic-utils/flows/temporal-types";
import type {
  FlowDefinition,
  PersistedEntities,
} from "@local/hash-isomorphic-utils/flows/types";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type {
  Entity,
  EntityTypeWithMetadata,
  EntityUuid,
} from "@local/hash-subgraph";
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

const constructFlowDefinition = (params: {
  includeQuestionAnswerAction: boolean;
}): FlowDefinition => {
  const { includeQuestionAnswerAction } = params;

  return {
    name: "Research Task",
    flowDefinitionId: "research-task" as EntityUuid,
    trigger: {
      triggerDefinitionId: "userTrigger",
      kind: "trigger",
      outputs: [
        {
          payloadKind: "Text",
          name: "prompt" as const,
          array: false,
          required: true,
        },
        {
          payloadKind: "VersionedUrl",
          name: "entityTypeIds",
          array: true,
          required: true,
        },
        ...(includeQuestionAnswerAction
          ? [
              {
                payloadKind: "Text",
                name: "question",
                array: false,
                required: true,
              } as const,
            ]
          : []),
      ],
    },
    steps: [
      {
        stepId: "1",
        kind: "action",
        actionDefinitionId: "researchEntities",
        inputSources: [
          {
            inputName:
              "prompt" satisfies InputNameForAction<"researchEntities">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "prompt",
          },
          {
            inputName:
              "entityTypeIds" satisfies InputNameForAction<"researchEntities">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "entityTypeIds",
          },
        ],
      },
      {
        stepId: "2",
        kind: "action",
        actionDefinitionId: "persistEntities",
        inputSources: [
          {
            inputName:
              "proposedEntities" satisfies InputNameForAction<"persistEntities">,
            kind: "step-output",
            sourceStepId: "1",
            sourceStepOutputName:
              "proposedEntities" satisfies OutputNameForAction<"researchEntities">,
          },
        ],
      },
      ...(includeQuestionAnswerAction
        ? [
            {
              stepId: "3",
              kind: "action" as const,
              actionDefinitionId: "answerQuestion" as const,
              inputSources: [
                {
                  inputName:
                    "question" satisfies InputNameForAction<"answerQuestion">,
                  kind: "step-output" as const,
                  sourceStepId: "trigger",
                  sourceStepOutputName: "question",
                },
                {
                  inputName:
                    "entities" satisfies InputNameForAction<"answerQuestion">,
                  kind: "step-output" as const,
                  sourceStepId: "2",
                  sourceStepOutputName:
                    "persistedEntities" satisfies OutputNameForAction<"persistEntities">,
                },
              ],
            },
          ]
        : []),
    ],
    outputs: [
      {
        stepId: "2",
        stepOutputName:
          "persistedEntities" satisfies OutputNameForAction<"persistEntities">,
        name: "persistedEntities" as const,
        payloadKind: "PersistedEntities",
        array: false,
        required: true,
      },
      ...(includeQuestionAnswerAction
        ? [
            {
              stepId: "3",
              stepOutputName:
                "answer" satisfies OutputNameForAction<"answerQuestion">,
              payloadKind: "Text",
              name: "answer" as const,
              array: false,
              required: true,
            } as const,
          ]
        : []),
    ],
  };
};

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
  persistedEntities: PersistedEntities;
}> = ({ persistedEntities }) => (
  <Typography component="ul" sx={{ marginLeft: 3 }}>
    {persistedEntities.persistedEntities.map((persistedEntity) => {
      const entity = persistedEntity.entity ?? persistedEntity.existingEntity!;

      return (
        <EntityListItem
          key={entity.metadata.recordId.entityId}
          persistedEntity={entity}
        />
      );
    })}
  </Typography>
);

export const ResearchTaskFlow: FunctionComponent = () => {
  const [startFlow, { loading }] = useMutation<
    StartFlowMutation,
    StartFlowMutationVariables
  >(startFlowMutation);

  const [entityType, setEntityType] = useState<EntityTypeWithMetadata>();
  const [prompt, setPrompt] = useState<string>("");
  const [question, setQuestion] = useState<string>("");

  const [persistedEntities, setPersistedEntities] =
    useState<PersistedEntities>();
  const [answer, setAnswer] = useState<string>();

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      if (entityType && prompt) {
        setPersistedEntities(undefined);
        setAnswer(undefined);

        const includeQuestionAnswerAction = !!question;

        const flowDefinition = constructFlowDefinition({
          includeQuestionAnswerAction,
        });

        const { data } = await startFlow({
          variables: {
            flowDefinition,
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
                ...(question
                  ? [
                      {
                        outputName: "question",
                        payload: {
                          kind: "Text",
                          value: question,
                        },
                      } as const,
                    ]
                  : []),
              ],
            },
          },
        });

        if (data) {
          const status = data.startFlow as RunFlowWorkflowResponse;

          if (status.code === StatusCode.Ok) {
            const persistedEntitiesOutput =
              status.contents[0]?.flowOutputs?.find(
                (output) => output.outputName === "persistedEntities",
              );

            if (!persistedEntitiesOutput) {
              throw new Error(
                "Status code 'Ok' but no persisted entities in payload",
              );
            }

            setPersistedEntities(
              persistedEntitiesOutput.payload.value as PersistedEntities,
            );

            if (includeQuestionAnswerAction) {
              const answerOutput = status.contents[0]?.flowOutputs?.find(
                (output) => output.outputName === "answer",
              );

              if (answerOutput) {
                setAnswer(answerOutput.payload.value as string);
              }
            }
          } else {
            throw new Error(status.message ?? "No error message");
          }
        }
      }
    },
    [entityType, prompt, question, startFlow],
  );

  const isDisabled = !entityType || !prompt;

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
        <Box>
          <InputLabel>Answer question about the data</InputLabel>
          <TextField
            value={question}
            onChange={({ target }) => setQuestion(target.value)}
            sx={{
              width: "100%",
              maxWidth: 440,
            }}
          />
        </Box>

        <Button type="submit" sx={{ maxWidth: 440 }} disabled={isDisabled}>
          Start Research Task
        </Button>
        {loading ? <Typography>Loading...</Typography> : null}
        {persistedEntities ? (
          <>
            <Typography>Created entities:</Typography>
            <EntitiesList persistedEntities={persistedEntities} />
          </>
        ) : null}
        {answer ? (
          <>
            <Typography>Answer:</Typography>
            <Typography>{answer}</Typography>
          </>
        ) : null}
      </Box>
    </SectionContainer>
  );
};
