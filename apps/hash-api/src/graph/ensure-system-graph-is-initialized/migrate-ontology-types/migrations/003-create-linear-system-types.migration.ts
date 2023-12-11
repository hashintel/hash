import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { BaseUrl, linkEntityTypeUrl } from "@local/hash-subgraph";
import { versionedUrlFromComponents } from "@local/hash-subgraph/type-system-patch";

import { enabledIntegrations } from "../../../../integrations/enabled-integrations";
import { MigrationFunction } from "../types";
import {
  anyUserInstantiator,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  if (!enabledIntegrations.linear) {
    return migrationState;
  }

  /** Linear Organization entity type */

  const allowMembersToInvitePropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Allow Members To Invite",
        description: "Whether member users are allowed to send invites.",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "linear",
      migrationState,
    });

  const allowedAuthServicePropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Allowed Auth Service",
        description:
          "Allowed authentication provider, empty array means all are allowed.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    });

  const archivedAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Archived At",
        description:
          "The time at which the entity was archived. Null if the entity has not been archived.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const createdAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Created At",
        description: "The time at which the entity was created.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const createdIssueCountPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Created Issue Count",
        description: "Number of issues created.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "linear",
      migrationState,
    });

  const deletionRequestedAtPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Deletion Requested At",
        description:
          "The time at which deletion of the organization was requested.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    });

  const gitBranchFormatPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Git Branch Format",
        description:
          "How git branches are formatted. If null, default formatting will be used.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const gitLinkbackMessagesEnabledPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Git Linkback Messages Enabled",
        description:
          "Whether the Git integration linkback messages should be sent to private repositories.",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "linear",
      migrationState,
    });

  const gitPublicLinkbackMessagesEnabledPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Git Public Linkback Messages Enabled",
        description:
          "Whether the Git integration linkback messages should be sent to public repositories.",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "linear",
      migrationState,
    });

  const idPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "ID",
        description: "The unique identifier of the entity.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const logoUrlPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Logo URL",
        description: "The organization's logo URL.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const namePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Name",
        description: "The organization's name.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const periodUploadVolumePropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Period Upload Volume",
        description:
          "Rolling 30-day total upload volume for the organization, in megabytes.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "linear",
      migrationState,
    });

  const previousUrlKeysPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Previous URL Keys",
        description:
          "Previously used URL keys for the organization (last 3 are kept and redirected).",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const projectUpdateRemindersHourPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Project Update Reminders Hour",
        description: "The hour at which to prompt for project updates.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "linear",
      migrationState,
    });

  const roadmapEnabledPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Roadmap Enabled",
        description: "Whether the organization is using a roadmap.",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const samlEnabledPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "SAML Enabled",
        description: "Whether SAML authentication is enabled for organization.",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const scimEnabledPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "SCIM Enabled",
        description: "Whether SCIM provisioning is enabled for organization.",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const trialEndsAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Trial Ends At",
        description: "The time at which the trial of the plus plan will end.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const updatedAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Updated At",
        description: [
          "The last time at which the entity was meaningfully updated,",
          "i.e. for all changes of syncable properties except those",
          "for which updates should not produce an update to updatedAt (see skipUpdatedAtKeys).",
          "This is the same as the creation time if the entity hasn't been updated after creation.",
        ].join(" "),
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const urlKeyPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "URL Key",
        description: "The organization's unique URL key.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const userCountPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "User Count",
        description: "Number of active users in the organization.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const linearOrganizationEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Organization",
        description:
          "An organization. Organizations are root-level objects that contain user accounts and teams.",
        properties: [
          {
            propertyType: allowMembersToInvitePropertyType,
          },
          {
            propertyType: allowedAuthServicePropertyType,
            required: true,
            array: true,
          },
          {
            propertyType: archivedAtPropertyType,
          },
          {
            propertyType: createdAtPropertyType,
            required: true,
          },
          {
            propertyType: createdIssueCountPropertyType,
            required: true,
          },
          {
            propertyType: deletionRequestedAtPropertyType,
          },
          {
            propertyType: gitBranchFormatPropertyType,
          },
          {
            propertyType: gitLinkbackMessagesEnabledPropertyType,
            required: true,
          },
          {
            propertyType: gitPublicLinkbackMessagesEnabledPropertyType,
            required: true,
          },
          {
            propertyType: idPropertyType,
            required: true,
          },
          {
            propertyType: logoUrlPropertyType,
          },
          {
            propertyType: namePropertyType,
            required: true,
          },
          {
            propertyType: periodUploadVolumePropertyType,
            required: true,
          },
          {
            propertyType: previousUrlKeysPropertyType,
            required: true,
            array: true,
          },
          // {
          //   propertyType: projectUpdateRemindersDayPropertyType,
          //   required: true,
          // },
          {
            propertyType: projectUpdateRemindersHourPropertyType,
            required: true,
          },
          {
            propertyType: roadmapEnabledPropertyType,
            required: true,
          },
          {
            propertyType: samlEnabledPropertyType,
            required: true,
          },
          {
            propertyType: scimEnabledPropertyType,
            required: true,
          },
          {
            propertyType: trialEndsAtPropertyType,
          },
          {
            propertyType: updatedAtPropertyType,
            required: true,
          },
          {
            propertyType: urlKeyPropertyType,
            required: true,
          },
          {
            propertyType: userCountPropertyType,
            required: true,
          },
        ],
        outgoingLinks: [
          /** @todo: integrations */
          /** @todo: labels */
          /** @todo: add subscription */
          /** @todo: add teams */
          /** @todo: add templates */
        ],
      },
      webShortname: "linear",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  /** Linear User entity type */

  const activePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Active",
        description:
          "Whether the user account is active or disabled (suspended).",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const adminPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Admin",
        description: " Whether the user is an organization administrator.",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const avatarUrlPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Avatar URL",
        description: "An URL to the user's avatar image.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const disableReasonPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Disable Reason",
        description: "Reason why is the account disabled.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const displayNamePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Display Name",
        description:
          "The user's display (nick) name. Unique within each organization.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const emailPropertyTypeBaseUrl = systemPropertyTypes.email
    .propertyTypeBaseUrl as BaseUrl;

  const emailPropertyTypeVersion =
    migrationState.propertyTypeVersions[emailPropertyTypeBaseUrl];

  if (typeof emailPropertyTypeVersion === "undefined") {
    throw new Error("Expected HASH email property type to have been seeded");
  }
  const emailPropertyTypeId = versionedUrlFromComponents(
    emailPropertyTypeBaseUrl,
    emailPropertyTypeVersion,
  );

  const guestPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Guest",
        description:
          "Whether the user is a guest in the workspace and limited to accessing a subset of teams.",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const inviteHashPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Invite Hash",
        description: "Unique hash for the user to be used in invite URLs.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const isMePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Is Me",
        description: " Whether the user is the currently authenticated user.",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const lastSeenPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Last Seen",
        description:
          "The last time the user was seen online. If null, the user is currently online.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const fullNamePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Full Name",
        description: "The user's full name.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const belongsToOrganizationLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Belongs To Organization",
        description: "The organization the user belongs to.",
        properties: [],
      },
      webShortname: "linear",
      migrationState,
      instantiator: anyUserInstantiator,
    });

  const statusEmojiPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Status Emoji",
        description: "The emoji to represent the user current status.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const statusLabelPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Status Label",
        description: "The label of the user current status.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const statusUntilAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Status Until At",
        description:
          "A date at which the user current status should be cleared.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const timezonePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Timezone",
        description: "The local timezone of the user.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const profileUrlPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Profile URL",
        description: "User's profile URL.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const hasCreatorLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Has Creator",
        description: "The user who created something.",
        properties: [],
      },
      webShortname: "linear",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const linearUserEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "User",
        description:
          "A user that has access to the the resources of an organization.",
        properties: [
          {
            propertyType: activePropertyType,
            required: true,
          },
          {
            propertyType: adminPropertyType,
            required: true,
          },
          {
            propertyType: archivedAtPropertyType,
          },
          {
            propertyType: avatarUrlPropertyType,
          },
          {
            propertyType: createdAtPropertyType,
            required: true,
          },
          {
            propertyType: createdIssueCountPropertyType,
            required: true,
          },
          {
            propertyType:
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
          },
          {
            propertyType: disableReasonPropertyType,
          },
          {
            propertyType: displayNamePropertyType,
            required: true,
          },
          {
            propertyType: emailPropertyTypeId,
            required: true,
          },
          {
            propertyType: guestPropertyType,
            required: true,
          },
          {
            propertyType: idPropertyType,
            required: true,
          },
          {
            propertyType: inviteHashPropertyType,
            required: true,
          },
          {
            propertyType: isMePropertyType,
            required: true,
          },
          {
            propertyType: lastSeenPropertyType,
          },
          {
            propertyType: fullNamePropertyType,
            required: true,
          },
          {
            propertyType: statusEmojiPropertyType,
          },
          {
            propertyType: statusLabelPropertyType,
          },
          {
            propertyType: statusUntilAtPropertyType,
          },
          {
            propertyType: timezonePropertyType,
          },
          {
            propertyType: updatedAtPropertyType,
            required: true,
          },
          {
            propertyType: profileUrlPropertyType,
            required: true,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: belongsToOrganizationLinkEntityType,
            minItems: 1,
            maxItems: 1,
            destinationEntityTypes: [linearOrganizationEntityType],
          },
          /** @todo: team memberships */
        ],
      },
      webShortname: "linear",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  /** Linear Workflow State entity type */

  const workflowStateEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Workflow State",
        description: "A state in a team workflow.",
      },
      webShortname: "linear",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  /** Linear Issue entity type */

  const hasAssigneeLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Has Assignee",
        description: "The user to whom the issue is assigned to.",
        properties: [],
      },
      webShortname: "linear",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const autoArchivedAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Auto Archived At",
        description:
          "The time at which the issue was automatically archived by the auto pruning process.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const autoClosedAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Auto Closed At",
        description:
          "The time at which the issue was automatically closed by the auto pruning process.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const branchNamePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Branch Name",
        description: "Suggested branch name for the issue.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const canceledAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Canceled At",
        description:
          "The time at which the issue was moved into canceled state.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const completedAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Completed At",
        description:
          "The time at which the issue was moved into completed state.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const customerTicketCountPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Customer Ticket Count",
        description:
          "Returns the number of Attachment resources which are created by customer support ticketing systems (e.g. Zendesk).",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "linear",
      migrationState,
    });

  const _associatedWithCycleLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Associated With Cycle",
        description: "The cycle that the issue is associated with.",
        properties: [],
      },
      webShortname: "linear",
      migrationState,
      instantiator: anyUserInstantiator,
    });

  const markdownDescriptionPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Markdown Description",
        description: "The issue's description in markdown format.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    });

  const dueDatePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Due Date",
        description: "The date at which the issue is due.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const estimatePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Estimate",
        description: "The estimate of the complexity of the issue.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const integrationSourceTypePropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Integration Source Type",
        description:
          "Integration type that created this issue, if applicable. (e.g. slack)",
        /** @todo: convert to union */
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    });

  const identifierPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Identifier",
        description: "Issue's human readable identifier (e.g. ENG-123).",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const issueNumberPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Issue Number",
        description: "The issue's unique number.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const parentLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Parent",
        description: "The parent of the issue.",
        properties: [],
      },
      webShortname: "linear",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const previousIdentifierPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Previous Identifier",
        description:
          "Previous identifier of the issue if it has been moved between teams.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    });

  const priorityPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Priority",
        description:
          "The priority of the issue. 0 = No priority, 1 = Urgent, 2 = High, 3 = Normal, 4 = Low.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const priorityLabelPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Priority Label",
        description: "Label for the priority.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const snoozedByLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Snoozed By",
        description: "The user who snoozed the issue.",
        properties: [],
      },
      webShortname: "linear",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const snoozedUntilAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Snoozed Until At",
        description: "The time until an issue will be snoozed in Triage view.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const sortOrderPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Sort Order",
        description:
          "The order of the item in relation to other items in the organization.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const startedAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Started At",
        description:
          "The time at which the issue was moved into started state.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const startedTriageAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Started Triage At",
        description: "The time at which the issue entered triage.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const stateLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "State",
        description: "The workflow state that the issue is associated with.",
        properties: [],
      },
      webShortname: "linear",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const subIssueSortOrderPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Sub Issue Sort Order",
        description:
          "The order of the item in the sub-issue list. Only set if the issue has a parent.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "linear",
      migrationState,
    });

  const hasSubscriberLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Has Subscriber",
        description: "A user who is subscribed to the issue.",
        properties: [],
      },
      webShortname: "linear",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const titlePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Title",
        description: "The issue's title.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const trashedPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Trashed",
        description:
          "A flag that indicates whether the issue is in the trash bin.",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const triagedAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Triaged At",
        description: "The time at which the issue left triage.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const issueUrlPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Issue URL",
        description: "The URL of the issue.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const linearIssueEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Issue",
        description: "An issue.",
        properties: [
          {
            propertyType: archivedAtPropertyType,
          },
          {
            propertyType: autoArchivedAtPropertyType,
          },
          {
            propertyType: autoClosedAtPropertyType,
          },
          {
            propertyType: branchNamePropertyType,
            required: true,
          },
          {
            propertyType: canceledAtPropertyType,
          },
          {
            propertyType: completedAtPropertyType,
          },
          {
            propertyType: createdAtPropertyType,
            required: true,
          },
          {
            propertyType: customerTicketCountPropertyType,
            required: true,
          },
          {
            propertyType: markdownDescriptionPropertyType,
          },
          {
            propertyType: dueDatePropertyType,
          },
          {
            propertyType: estimatePropertyType,
          },
          {
            propertyType: idPropertyType,
            required: true,
          },
          {
            propertyType: identifierPropertyType,
            required: true,
          },
          {
            propertyType: integrationSourceTypePropertyType,
          },
          {
            propertyType: issueNumberPropertyType,
            required: true,
          },
          {
            propertyType: previousIdentifierPropertyType,
            required: true,
            array: true,
          },
          {
            propertyType: priorityPropertyType,
            required: true,
          },
          {
            propertyType: priorityLabelPropertyType,
            required: true,
          },
          {
            propertyType: snoozedUntilAtPropertyType,
          },
          {
            propertyType: sortOrderPropertyType,
            required: true,
          },
          {
            propertyType: startedAtPropertyType,
          },
          {
            propertyType: startedTriageAtPropertyType,
          },
          {
            propertyType: subIssueSortOrderPropertyType,
          },
          {
            propertyType: titlePropertyType,
            required: true,
          },
          {
            propertyType: trashedPropertyType,
          },
          {
            propertyType: triagedAtPropertyType,
          },
          {
            propertyType: updatedAtPropertyType,
            required: true,
          },
          {
            propertyType: issueUrlPropertyType,
            required: true,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasAssigneeLinkEntityType,
            maxItems: 1,
            destinationEntityTypes: [linearUserEntityType],
          },
          {
            linkEntityType: hasCreatorLinkEntityType,
            maxItems: 1,
            destinationEntityTypes: [linearUserEntityType],
          },
          /** @todo: add linked comments */
          /** @todo: cycles */
          // {
          //   linkEntityType: associatedWithCycleLinkEntityType,
          //   maxItems: 1,
          //   destinationEntityTypes: [linearCycleEntityType],
          // },
          /** @todo: external user creator [ALPHA] */
          /** @todo: favorite */
          /** @todo: history (do we even need this?) */
          /** @todo: inverse relations */
          /** @todo: last applied template */
          {
            linkEntityType: parentLinkEntityType,
            maxItems: 1,
            destinationEntityTypes: ["SELF_REFERENCE"],
          },
          /** @todo: project */
          /** @todo: project milestone */
          /** @todo: relations */
          {
            linkEntityType: snoozedByLinkEntityType,
            maxItems: 1,
            destinationEntityTypes: [linearUserEntityType],
          },
          {
            linkEntityType: stateLinkEntityType,
            minItems: 1,
            maxItems: 1,
            destinationEntityTypes: [workflowStateEntityType],
          },
          {
            linkEntityType: hasSubscriberLinkEntityType,
            destinationEntityTypes: [linearUserEntityType],
          },
          /** @todo: team */
        ],
      },
      webShortname: "linear",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  /** Linear Attachment entity type */

  const groupBySourcePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Group By Source",
        description:
          "Indicates if attachments for the same source application should be grouped in the Linear UI.",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const belongsToIssueLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Belongs To Issue",
        description: "The issue this attachment belongs to.",
      },
      webShortname: "linear",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const metadataPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Metadata",
        description: "Custom metadata related to the attachment.",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const sourcePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Source",
        description:
          "Information about the source which created the attachment.",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const sourceTypePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Source Type",
        description:
          "An accessor helper to source.type, defines the source type of the attachment.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const subtitlePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Subtitle",
        description:
          "Content for the subtitle line in the Linear attachment widget.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const attachmentUrlPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Attachment URL",
        description:
          "Location of the attachment which is also used as an identifier.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "linear",
      migrationState,
    },
  );

  const _linearAttachmentEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Attachment",
        description: "Issue attachment (e.g. support ticket, pull request).",
        properties: [
          {
            propertyType: archivedAtPropertyType,
          },
          {
            propertyType: createdAtPropertyType,
          },
          {
            propertyType: groupBySourcePropertyType,
            required: true,
          },
          {
            propertyType: idPropertyType,
            required: true,
          },
          {
            propertyType: metadataPropertyType,
            required: true,
          },
          {
            propertyType: sourcePropertyType,
          },
          {
            propertyType: sourceTypePropertyType,
          },
          {
            propertyType: subtitlePropertyType,
          },
          {
            propertyType: "https://hash.ai/@hash/types/property-type/title/v/1",
          },
          {
            propertyType: updatedAtPropertyType,
            required: true,
          },
          {
            propertyType: attachmentUrlPropertyType,
            required: true,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasCreatorLinkEntityType,
            maxItems: 1,
            destinationEntityTypes: [linearUserEntityType],
          },
          /** @todo: external user creator */
          {
            linkEntityType: belongsToIssueLinkEntityType,
            maxItems: 1,
            destinationEntityTypes: [linearIssueEntityType],
          },
        ],
      },
      webShortname: "linear",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  return migrationState;
};

export default migrate;
