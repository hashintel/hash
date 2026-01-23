import { gql } from "@apollo/client";

/**
 * Triggers LLM-based configuration workflow for a dashboard item.
 * This starts a Temporal workflow that generates a query, analyzes data,
 * and produces chart configuration based on the user's goal.
 */
export const configureDashboardItemMutation = gql`
  mutation configureDashboardItem($itemEntityId: EntityId!, $webId: WebId!) {
    configureDashboardItem(itemEntityId: $itemEntityId, webId: $webId) {
      workflowId
      itemEntityId
    }
  }
`;
