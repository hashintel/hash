import { gql } from "apollo-server-express";

import { ROOT_ENTITY_FIELDS } from "./entity.typedef";

export const pageTypedef = gql`
  type Page implements Entity {
    properties: PageProperties!

    ${ROOT_ENTITY_FIELDS}
  }

  type PageProperties {
    archived: Boolean
    contents: [Block!]!
    summary: String
    title: String!
  }

  extend type Query {
    page(id: ID!): Page!
  }

  extend type Mutation {
    updatePage(id: ID!): Page!
  }
`;
