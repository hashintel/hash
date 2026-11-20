import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
} from "../util";

import type { MigrationFunction } from "../types";

/**
 * Adds `Agent Conversation`: one conversation between a user and an AI agent, which may focus on entities, such as a
 * process. The entity holds no messages: the agent's own store keeps those, under the `Conversation ID`. The entity is
 * the conversation's handle in the graph. It says which conversation a user has open on an entity, so that it follows
 * them to another browser, and archiving it says the conversation has ended and its messages may go.
 *
 * It is not tied to one agent or one kind of entity: `Agent ID` names the agent and the service that keeps its
 * conversations, and `Has Agent Conversation Focus` links it to any entity it focuses on, in any web.
 *
 * The link has its own type, rather than a general one such as `Has Subject`, because the Graph's default policies
 * keep both the conversation and its focus links private to the user who created them, and they do so by type.
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

  const hasAgentConversationFocusLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Has Agent Conversation Focus",
        inverse: {
          title: "Focus of Agent Conversation",
        },
        description:
          "An entity that an agent conversation focuses on, such as a process. Only for agent conversations: like the conversation, it is private to the user who created it by default.",
        properties: [],
      },
      webShortname: "h",
      migrationState,
    });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Agent Conversation",
      titlePlural: "Agent Conversations",
      description:
        "A conversation between a user and an AI agent, which may focus on entities, such as a process.",
      properties: [
        {
          propertyType: conversationIdPropertyType.schema.$id,
          required: true,
        },
        {
          propertyType: agentIdPropertyType.schema.$id,
          required: true,
        },
      ],
      outgoingLinks: [
        {
          linkEntityType: hasAgentConversationFocusLinkEntityType,
        },
      ],
    },
    webShortname: "h",
    migrationState,
  });

  return migrationState;
};

export default migrate;
