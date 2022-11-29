import { gql } from "@apollo/client";

export const getHashInstanceEntityQuery = gql`
  query getHashInstanceEntityQuery {
    # This is a scalar, which has no selection.
    hashInstanceEntity
  }
`;
