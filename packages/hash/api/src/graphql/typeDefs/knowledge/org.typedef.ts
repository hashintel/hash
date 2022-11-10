import { gql } from "apollo-server-express";

export const persistedOrgTypedef = gql`
  enum OrgSize {
    ELEVEN_TO_FIFTY
    FIFTY_ONE_TO_TWO_HUNDRED_AND_FIFTY
    ONE_TO_TEN
    TWO_HUNDRED_AND_FIFTY_PLUS
  }

  extend type Mutation {
    """
    Create an organization.
    """
    createOrg(
      """
      The shortname of the organization.
      """
      shortname: String!
      """
      The name of the organization.
      """
      name: String!
      """
      The size of the organization.
      """
      orgSize: OrgSize!
      """
      The depth of links that are returned in the response subgraph.
      """
      linkResolveDepth: Int! = 0
      """
      The depth of link target entities that are returned in the response subgraph.
      """
      linkTargetEntityResolveDepth: Int! = 0
    ): Subgraph!
  }
`;
