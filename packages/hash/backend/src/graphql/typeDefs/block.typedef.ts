import { gql } from "apollo-server-express";

export const blockTypedef = gql`
  type Block {
    entity: ID!
    entityType: String!
    component: ID!
  }

  type RichEditorBlock {
    contents: JSONObject!
  }
`;
