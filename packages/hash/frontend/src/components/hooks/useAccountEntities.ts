import { unstable_batchedUpdates } from "react-dom";
import { useCallback, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { getEntities } from "../../graphql/queries/entity.queries";
import {
  GetEntitiesQuery,
  GetEntitiesQueryVariables,
  EntityTypeChoice,
} from "../../graphql/apiTypes.gen";

// @todo handle error state
export const useAccountEntities = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GetEntitiesQuery["entities"]>([]);
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
    data,
  };
};
