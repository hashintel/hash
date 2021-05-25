import { gql } from "apollo-server-express";
import { ROOT_ENTITY_FIELDS } from "./entity.typedef";

export const pageTypedef = gql`
  type Page implements Entity {
    ${ROOT_ENTITY_FIELDS}
    
    properties: PageProperties!
    archived: Boolean
    contents: [Block!]!
    summary: String
    title: String!
  }


`;
