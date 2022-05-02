import { useQuery } from "@apollo/client";
import { getEntities } from "../../graphql/queries/entity.queries";
import {
  GetEntitiesQuery,
  GetEntitiesQueryVariables,
  EntityTypeChoice,
} from "../../graphql/apiTypes.gen";

// @todo handle error state
export const useAccountEntities = ({
  accountId,
  entityTypeFilter,
  skip,
}: {
  accountId: string;
  entityTypeFilter: EntityTypeChoice;
  skip: boolean;
}) => {
  const { data, loading } = useQuery<
    GetEntitiesQuery,
    GetEntitiesQueryVariables
  >(getEntities, {
    variables: {
      accountId,
      filter: {
        entityType: entityTypeFilter,
      },
    },
    skip,
  });

  return {
    loading,
    data: data?.entities ?? [],
  };
};
