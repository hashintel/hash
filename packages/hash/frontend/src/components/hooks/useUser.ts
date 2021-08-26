import { useContext } from "react";
import { UserContext } from "../contexts/UserContext";

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
  const { user, refetch, loading } = useContext(UserContext);

  return { user, refetch, loading };
};
