import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getCurrentHashLinkEntityTypeId,
  getCurrentHashSystemEntityTypeId,
} from "../util";

import type { MigrationFunction } from "../types";

/**
 * Adds `Agent Conversation`: a user's conversation with an AI agent about one thing, such as a process. The entity
 * holds no messages. It records which conversation the agent's own store should open, so that the conversation
 * follows the user to another browser and a cleared conversation stays cleared.
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

  const hasSubjectLinkEntityTypeId = getCurrentHashLinkEntityTypeId({
    linkEntityTypeKey: "hasSubject",
    migrationState,
  });

  const petriNetEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "petriNet",
    migrationState,
  });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Agent Conversation",
      titlePlural: "Agent Conversations",
      description:
        "A conversation between a user and an AI agent about something, such as a process.",
      properties: [
        {
          propertyType: conversationIdPropertyType.schema.$id,
          required: true,
        },
      ],
      outgoingLinks: [
        {
          linkEntityType: hasSubjectLinkEntityTypeId,
          destinationEntityTypes: [petriNetEntityTypeId],
          minItems: 0,
          maxItems: 1,
        },
      ],
    },
    webShortname: "h",
    migrationState,
  });

  return migrationState;
};

export default migrate;
