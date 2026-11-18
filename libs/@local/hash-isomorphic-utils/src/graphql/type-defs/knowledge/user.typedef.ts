import { gql } from "graphql-tag";

export const userTypedef = gql`
  scalar AggregatedUsageRecord
  scalar ProspectiveUserProperties

  """
  The signed-in account as the session names it, read without querying the
  graph: for a service acting for the user that needs only who they are.
  """
  type SessionAccount {
    """
    The user's web, which is their account id.
    """
    webId: WebId!
    """
    Whether the account has a shortname and a display name, hash-api's own
    rule for a completed signup.
    """
    accountSignupComplete: Boolean!
  }

  type UserUsageRecords {
    shortname: String!
    usageRecords: [AggregatedUsageRecord!]!
  }

  extend type Query {
    me: SubgraphAndPermissions!
    """
    The signed-in account and whether its signup is complete
    """
    sessionAccount: SessionAccount!
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
