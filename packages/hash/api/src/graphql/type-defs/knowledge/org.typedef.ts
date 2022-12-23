import { gql } from "apollo-server-express";

export const orgTypedef = gql`
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
      The depths that \`hasLeftEntity\` edges are resolved to.
      """
      hasLeftEntity: EdgeResolveDepthsInput! = { outgoing: 0, incoming: 0 }
      """
      The depths that \`hasRightEntity\` edges are resolved to.
      """
      hasRightEntity: EdgeResolveDepthsInput! = { outgoing: 0, incoming: 0 }
    ): Subgraph!
  }
`;
