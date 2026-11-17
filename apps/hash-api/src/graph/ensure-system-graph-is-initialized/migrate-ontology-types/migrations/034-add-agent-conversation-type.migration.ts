import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
} from "../util";

import type { MigrationFunction } from "../types";

/**
 * Adds `Agent Conversation`: one conversation between a user and an AI agent, which may have been started on an
 * entity, such as a process. The entity holds no messages: the agent's own store keeps those, under the
 * `Conversation ID`. The entity is the conversation's handle in the graph. It says which conversation a user has open
 * where they started it, so that it follows them to another browser, and archiving it says the conversation has ended
 * and its messages may go.
 *
 * It is not tied to one agent or one kind of entity: `Agent ID` names the agent and the service that keeps its
 * conversations, and `Context Entity ID` may hold the id of any entity. It is a property rather than a link: it
 * records where the conversation was started, not what it is about.
 */
const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const conversationIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Conversation ID",
        description:
          "An identifier for a conversation, in the system that stores its messages.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const agentIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Agent ID",
        description:
          "An identifier for an AI agent and the service that keeps its conversations, such as `brunch/hash`. It is not the name of a model.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const contextEntityIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Context Entity ID",
        description:
          "The ID of the entity that was open where something was started, such as the process a conversation was started on.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Agent Conversation",
      titlePlural: "Agent Conversations",
      description:
        "A conversation between a user and an AI agent, which may have been started on an entity, such as a process.",
      properties: [
        {
          propertyType: conversationIdPropertyType.schema.$id,
          required: true,
        },
        {
          propertyType: agentIdPropertyType.schema.$id,
          required: true,
        },
        {
          propertyType: contextEntityIdPropertyType.schema.$id,
          required: false,
        },
      ],
    },
    webShortname: "h",
    migrationState,
  });

  return migrationState;
};

export default migrate;
