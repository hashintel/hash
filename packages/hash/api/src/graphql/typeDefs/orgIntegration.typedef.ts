import { gql } from "apollo-server-express";

/**
 * Administrative actions for integrations.
 */
export const orgIntegrationTypedef = gql`
  type OrgIntegrationConfigurationField {
    fieldKey: String!
    """
    Display label for this field
    """
    label: String!
    """
    A value for this field is required
    """
    required: Boolean!
    """
    The value for this field is secret, so, you cannot get the real "currentValue".
    """
    secret: Boolean!
    """
    Value as JSON string. Perhaps would like to have a scalar for number | string | date?
    """
    currentValue: String
    """
    Last time that this field's value was updated
    """
    lastUpdatedAt: Date
  }

  type OrgIntegration {
    """
    Unique identification for this integration.
    Internally, this is used to also identify the workflow managing this integration.
    """
    integrationId: ID!
    """
    Name of this integration, e.g. "asana" or "github"
    """
    integrationName: String!
    enabled: Boolean!
    fields: [OrgIntegrationConfigurationField!]!
  }

  input OrgIntegrationFieldValue {
    fieldKey: String!
    """
    Value as JSON string. Perhaps would like to have a scalar for number | string | date?
    """
    value: String
  }

  input CreateOrgIntegrationInput {
    organizationEntityId: ID!
    """
    e.g. "asana" or "github"
    """
    integrationName: String!
    """
    Optionally supply initial fields
    """
    fields: [OrgIntegrationFieldValue!]
  }

  extend type Mutation {
    """
    Update the integration's fields
    """
    configureOrgIntegration(
      organizationEntityId: ID!
      integrationId: ID!
      fields: [OrgIntegrationFieldValue!]!
    ): OrgIntegration!
    """
    Update the integration's enabled status
    """
    enableOrgIntegration(
      organizationEntityId: ID!
      integrationId: ID!
      enable: Boolean!
    ): OrgIntegration!
    """
    Create a new integration
    """
    createOrgIntegration(input: CreateOrgIntegrationInput!): OrgIntegration!
  }
`;
