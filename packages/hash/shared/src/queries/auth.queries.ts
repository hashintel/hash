import gql from "graphql-tag";

export const getBasicWhoAmI = gql`
  query basicWhoAmI {
    me {
      entityId
      properties {
        shortname
        preferredName
      }
    }
  }
`;
