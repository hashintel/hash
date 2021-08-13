import { useQuery } from "@apollo/client";
import { meQuery } from "../../graphql/queries/user.queries";
import { MeQuery } from "../../graphql/apiTypes.gen";

/**
 * Returns an object containing:
 *
 * user: the authenticated user (if any)
 *
 * refetch: a function to refetch the user from the API (ApolloClient will update the cache with the return)
 *
 * loading: a boolean to check if the api call is still loading
 */
export const useUser = () => {
  const { data, refetch, loading } = useQuery<MeQuery>(meQuery);
  const user = data?.me;

  return { user, refetch, loading };
};
