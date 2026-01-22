import { gql } from "graphql-tag";

export const dashboardTypedef = gql`
  type ConfigureDashboardItemResult {
    workflowId: String!
    itemEntityId: EntityId!
  }

  extend type Mutation {
    """
    Trigger LLM configuration for a dashboard item
    """
    configureDashboardItem(
      itemEntityId: EntityId!
      webId: WebId!
    ): ConfigureDashboardItemResult!
  }
`;
