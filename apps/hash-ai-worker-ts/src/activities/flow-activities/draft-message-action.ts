import dedent from "dedent";

import { isEntityId, splitEntityId } from "@blockprotocol/type-system";
import {
  getStorageProvider,
  resolvePayloadValue,
} from "@local/hash-backend-utils/flows/payload-storage";
import { getSimpleGraph } from "@local/hash-backend-utils/simplified-graph";
import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";
import { getSimplifiedFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { maxDraftMessageEntities } from "@local/hash-isomorphic-utils/flows/limits";
import { getArrayPayloadLength } from "@local/hash-isomorphic-utils/flows/stored-payload-refs";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";
import { StatusCode } from "@local/status";

import { getFlowContext } from "../shared/get-flow-context.js";
import { getLlmResponse } from "../shared/get-llm-response.js";
import { getToolCallsFromLlmAssistantMessage } from "../shared/get-llm-response/llm-message.js";
import { graphApiClient } from "../shared/graph-api-client.js";

import type { PermittedAnthropicModel } from "../shared/get-llm-response/anthropic-client.js";
import type { LlmMessage } from "../shared/get-llm-response/llm-message.js";
import type { LlmToolDefinition } from "../shared/get-llm-response/types.js";
import type { EntityId, UserId } from "@blockprotocol/type-system";
import type { FlowActionActivity } from "@local/hash-backend-utils/flows";
import type { Filter } from "@local/hash-graph-client";
import type { FlowActionStepOutput } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { Status } from "@local/status";

/** Claude Haiku 5.5 is the intended successor, once the worker permits it (it only accepts a temperature of 1). */
const model: PermittedAnthropicModel = "claude-haiku-4-5-20251001";

/** Model calls per step run, for a draft that is missing or has an empty subject or body. */
const maxAttempts = 3;

const submitDraftTool: LlmToolDefinition<"submitDraft"> = {
  name: "submitDraft",
  description: "Submit the drafted message.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      subject: {
        type: "string",
        description: "The message's subject line, on one line.",
      },
      body: {
        type: "string",
        description:
          "The message's body in plain text, with line breaks between paragraphs: no HTML or Markdown.",
      },
    },
    required: ["subject", "body"],
  },
};

const systemPrompt = dedent(`
  You draft a single message, such as an email, for the user to review before it is sent.
  Follow the user's instructions, and draw only on the context and entities they provide: don't invent facts, names or figures.
  Write the body in plain text, with ordinary line breaks between paragraphs. Don't use HTML, Markdown or other formatting.
  Don't leave placeholders such as [Name] or {{firstName}} to fill in later.
  Submit the subject and body with the submitDraft tool.
`);

const failure = (code: StatusCode, message: string): Status<never> => ({
  code,
  message,
  contents: [],
});

/**
 * Loads the entities as the user running the flow, in the form the model reads best: their properties keyed by
 * property title, with the titles of their types. Each entity ID loads exactly the edition it names: the draft for one
 * with a draft ID, otherwise the live edition.
 */
const loadEntities = async (
  entityIds: EntityId[],
  authentication: { actorId: UserId },
) => {
  const filter: Filter = {
    any: entityIds.map((entityId) => {
      const [webId, entityUuid, draftId] = splitEntityId(entityId);

      return {
        all: [
          { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
          { equal: [{ path: ["webId"] }, { parameter: webId }] },
          draftId
            ? { equal: [{ path: ["draftId"] }, { parameter: draftId }] }
            : { not: { exists: { path: ["draftId"] } } },
        ],
      };
    }),
  };

  const { subgraph } = await queryEntitySubgraph(
    { graphApi: graphApiClient },
    authentication,
    {
      filter,
      graphResolveDepths: almostFullOntologyResolveDepths,
      traversalPaths: [],
      includeDrafts: true,
      temporalAxes: currentTimeInstantTemporalAxes,
      includePermissions: false,
    },
  );

  return {
    foundEntityIds: new Set(subgraph.roots.map(({ baseId }) => baseId)),
    simpleEntities: getSimpleGraph(subgraph).entities,
  };
};

/**
 * Drafts a message with a subject and a plain-text body, following the instructions and drawing on the context text
 * and the properties of the entities given.
 *
 * The entities must be in the web the flow runs in and readable by the user running it: one that is missing or
 * unreadable fails the step rather than being left out, as do more than `maxDraftMessageEntities`. A draft with no
 * subject or body is asked for again, up to `maxAttempts` model calls in all.
 */
export const draftMessageAction: FlowActionActivity<"draftMessage"> = async ({
  inputs,
}) => {
  const {
    instructions,
    context,
    entities: entitiesInput,
  } = getSimplifiedFlowActionInputs({
    inputs,
    actionType: "draftMessage",
  });

  const { flowEntityId, stepId, userAuthentication, webId, workflowId } =
    await getFlowContext();

  /* Counted before resolving, so a stored list that is too long isn't downloaded. */
  const entityCount = entitiesInput ? getArrayPayloadLength(entitiesInput) : 0;

  if (entityCount > maxDraftMessageEntities) {
    return failure(
      StatusCode.InvalidArgument,
      `A message can be drafted from at most ${maxDraftMessageEntities} entities, but ${entityCount} were given.`,
    );
  }

  /* A stored list of entity IDs, or one item of one (e.g. a for-each item, wrapped into a list), is a reference. */
  const entityIds = entitiesInput
    ? [
        ...new Set(
          await resolvePayloadValue(
            { storageProvider: getStorageProvider(), workflowId },
            "EntityId",
            entitiesInput,
          ),
        ),
      ]
    : [];

  for (const entityId of entityIds) {
    if (!isEntityId(entityId)) {
      return failure(
        StatusCode.InvalidArgument,
        `${String(entityId)} is not a valid EntityId.`,
      );
    }

    if (splitEntityId(entityId)[0] !== webId) {
      return failure(
        StatusCode.InvalidArgument,
        `Entity ${entityId} isn't in the web the flow runs in.`,
      );
    }
  }

  let entitiesText: string | undefined;

  if (entityIds.length > 0) {
    const { foundEntityIds, simpleEntities } = await loadEntities(
      entityIds,
      userAuthentication,
    );

    const missingEntityId = entityIds.find(
      (entityId) => !foundEntityIds.has(entityId),
    );

    if (missingEntityId) {
      return failure(
        StatusCode.NotFound,
        `Entity ${missingEntityId} wasn't found or you don't have access to it.`,
      );
    }

    /* The simple graph only describes a link as part of the entity it starts from, which isn't loaded here. */
    const linkEntityId = entityIds.find(
      (entityId) =>
        !simpleEntities.some((entity) => entity.entityId === entityId),
    );

    if (linkEntityId) {
      return failure(
        StatusCode.InvalidArgument,
        `Entity ${linkEntityId} is a link, which can't be used to draft a message.`,
      );
    }

    entitiesText = JSON.stringify(
      entityIds.map((entityId) => {
        const { entityTypes, properties } = simpleEntities.find(
          (entity) => entity.entityId === entityId,
        )!;

        return { entityTypes, properties };
      }),
      null,
      2,
    );
  }

  const messages: LlmMessage[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: [
            `<Instructions>\n${instructions}\n</Instructions>`,
            context ? `<Context>\n${context}\n</Context>` : undefined,
            entitiesText
              ? `<Entities>\nThe entities to draw on, each with the titles of its types and its properties keyed by title:\n${entitiesText}\n</Entities>`
              : undefined,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    },
  ];

  let problem = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const llmResponse = await getLlmResponse(
      {
        model,
        systemPrompt,
        messages,
        temperature: 0,
        tools: [submitDraftTool],
        toolChoice: "submitDraft",
      },
      {
        customMetadata: { stepId, taskName: "draft-message" },
        userAccountId: userAuthentication.actorId,
        graphApiClient,
        incurredInEntities: [{ entityId: flowEntityId }],
        webId,
      },
    );

    /* The model call already retried a draft that didn't match the tool's schema. */
    if (
      llmResponse.status === "exceeded-maximum-retries" ||
      llmResponse.status === "max-tokens"
    ) {
      return failure(
        StatusCode.Internal,
        `The model didn't return a valid draft (${llmResponse.status}).`,
      );
    }

    /* Thrown, so that Temporal retries the step as it does for other failures, such as the provider being down. */
    if (llmResponse.status !== "ok") {
      throw new Error(
        `The model call failed (${llmResponse.status})${"message" in llmResponse ? `: ${llmResponse.message}` : ""}`,
      );
    }

    const { message } = llmResponse;
    const toolCalls = getToolCallsFromLlmAssistantMessage({ message });
    const draft = toolCalls[0]?.input as
      | { subject?: unknown; body?: unknown }
      | undefined;

    const subject = typeof draft?.subject === "string" ? draft.subject : "";
    const body = typeof draft?.body === "string" ? draft.body : "";

    problem = !draft
      ? "You didn't submit a draft with the submitDraft tool."
      : !subject.trim()
        ? "The draft's subject is empty."
        : !body.trim()
          ? "The draft's body is empty."
          : "";

    if (!problem) {
      return {
        code: StatusCode.Ok,
        contents: [
          {
            outputs: [
              {
                outputName: "subject",
                payload: { kind: "Text", value: subject.trim() },
              },
              {
                outputName: "body",
                payload: { kind: "Text", value: body.trim() },
              },
            ] satisfies FlowActionStepOutput<"draftMessage">[],
          },
        ],
      };
    }

    const retryMessage = `${problem} Submit the draft again with the submitDraft tool.`;

    messages.push(message, {
      role: "user",
      content:
        toolCalls.length > 0
          ? toolCalls.map(({ id }) => ({
              type: "tool_result",
              tool_use_id: id,
              content: retryMessage,
              is_error: true,
            }))
          : [{ type: "text", text: retryMessage }],
    });
  }

  return failure(
    StatusCode.ResourceExhausted,
    `The model didn't return a usable draft in ${maxAttempts} attempts: ${problem}`,
  );
};
