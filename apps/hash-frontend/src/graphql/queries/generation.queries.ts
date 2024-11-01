import { gql } from "@apollo/client";

export const generateInverseQuery = gql`
  query generateInverse($relationship: String!) {
    generateInverse(relationship: $relationship)
  }
`;

export const generatePluralQuery = gql`
  query generatePlural($singular: String!) {
    generatePlural(singular: $singular)
  }
`;
