import { unstable_batchedUpdates } from "react-dom";
import { useCallback, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { getEntities } from "../../graphql/queries/entity.queries";
import {
  GetEntitiesQuery,
  GetEntitiesQueryVariables,
  EntityTypeChoice,
  UnknownEntity,
} from "../../graphql/apiTypes.gen";

// @todo properly type this
export const useAccountEntities = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState();
  const [data, setData] = useState<
    Pick<
      UnknownEntity,
      | "accountId"
      | "entityId"
      | "entityTypeId"
      | "entityTypeName"
      | "properties"
    >[]
  >([]);
  const client = useApolloClient();

  const fetchEntities = useCallback(
    async (accountId: string, entityTypeFilter: EntityTypeChoice) => {
      setLoading(true);
      const response = await client.query<
        GetEntitiesQuery,
        GetEntitiesQueryVariables
      >({
        query: getEntities,
        variables: {
          accountId,
          filter: {
            entityType: entityTypeFilter,
          },
        },
      });

      unstable_batchedUpdates(() => {
        setLoading(false);
        setData(response.data.entities);
      });
    },
    [client],
  );

  return {
    fetchEntities,
    loading,
    error,
    data,
  };
};
