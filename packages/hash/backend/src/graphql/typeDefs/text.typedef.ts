import { gql } from "apollo-server-express";

import { ROOT_ENTITY_FIELDS } from "./entity.typedef";

export const textTypedef = gql`
  type Text implements Entity {
    properties: TextProperites!

    ${ROOT_ENTITY_FIELDS}
  }

  type TextProperites {
    text: String!
    bold: Boolean
    underline: Boolean
    italics: Boolean
  }
`;