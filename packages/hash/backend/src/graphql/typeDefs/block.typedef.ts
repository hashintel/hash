import { gql } from "apollo-server-express";

export const blockTypedef = gql`
  type Block {
    entity: Entity!
    entityType: String!
    componentId: ID!
  }
`;
