import { gql } from "graphql-tag";

export const userTypedef = gql`
  scalar AggregatedUsageRecord
  scalar ProspectiveUserProperties

  type UserUsageRecords {
    shortname: String!
    usageRecords: [AggregatedUsageRecord!]!
  }

  extend type Query {
    me: SubgraphAndPermissions!
    """
    Determines whether a provided shortname is already taken
    """
    isShortnameTaken(shortname: String!): Boolean!
    """
    Determines whether the authenticated user has access to the instance of HASH
    """
    hasAccessToHash: Boolean!

    getUsageRecords: [UserUsageRecords!]!

    """
    Get the user's position on the access waitlist (for hosted HASH)
    """
    getWaitlistPosition: Int!
  }

  extend type Mutation {
    submitEarlyAccessForm(properties: ProspectiveUserProperties!): Boolean
  }
`;
