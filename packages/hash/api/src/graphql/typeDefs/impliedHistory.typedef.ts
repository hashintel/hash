import { gql } from "apollo-server-express";

export const impliedHistoryTypedef = gql`
  type ImpliedEntityVersion {
    createdAt: Date!
  }

  type ImpliedEntityHistory {
    timelineId: ID!
    timeline: [ImpliedEntityVersion!]!
  }

  extend type Query {
    """
    Get the implied entity history for a given entity.
    """
    getImpliedEntityHistory(
      accountId: ID!
      entityId: ID!
    ): ImpliedEntityHistory!

    """
    Get a specific implied version of an entity. The impliedVersionCreatedAt should
    match one of the items returned by the getImpliedEntityHistory resolver.
    """
    getImpliedEntityVersion(
      accountId: ID!
      entityId: ID!
      impliedVersionCreatedAt: Date!
    ): UnknownEntity!
  }
`;
