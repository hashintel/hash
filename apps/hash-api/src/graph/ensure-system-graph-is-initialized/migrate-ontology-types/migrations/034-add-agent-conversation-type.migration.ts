import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getCurrentHashLinkEntityTypeId,
} from "../util";

import type { MigrationFunction } from "../types";

/**
 * Adds `Agent Conversation`: one conversation between a user and an AI agent, which may be about one entity, such as a
 * process. The entity holds no messages: the agent's own store keeps those, under the `Conversation ID`. The entity is
 * the conversation's handle in the graph. It says which conversation a user has open about something, so that it
 * follows them to another browser, and archiving it says the conversation has ended and its messages may go.
 *
 * It is not tied to one agent or one kind of subject: `Agent ID` names the agent, and the subject may be any entity.
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
        description: "An identifier for an AI agent.",
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

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Agent Conversation",
      titlePlural: "Agent Conversations",
      description:
        "A conversation between a user and an AI agent, which may be about something, such as a process.",
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
          linkEntityType: hasSubjectLinkEntityTypeId,
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
