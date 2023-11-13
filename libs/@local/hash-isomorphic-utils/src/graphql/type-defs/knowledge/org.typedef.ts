import { gql } from "apollo-server-express";

export const orgTypedef = gql`
  extend type Mutation {
    """
    Create an organization. The creator will be automatically added as an org member.
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
      The website of the organization.
      """
      websiteUrl: String
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
