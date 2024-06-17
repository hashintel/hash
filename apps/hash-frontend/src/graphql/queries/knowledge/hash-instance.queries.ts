import { gql } from "@apollo/client";

export const getHashInstanceSettings = gql`
  query getHashInstanceSettingsQuery {
    hashInstanceSettings {
      entity
      isUserAdmin
    }
  }
`;
