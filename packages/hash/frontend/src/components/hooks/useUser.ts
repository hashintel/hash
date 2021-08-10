import { useQuery } from "@apollo/client";
import { meQuery } from "../../graphql/queries/user.queries";
import { User } from '../../graphql/apiTypes.gen'

/**
 * Returns an array containing:
 *
 * [0] the authenticated user (if any)
 *
 * [1] a function to refetch the user from the API (ApolloClient will update the cache with the return)
 * 
 * [2] a boolean to check if the api call is still loading
 */
export const useUser = (): [User | null, () => void, boolean] => {
    const { data, refetch, loading } = useQuery(meQuery)
    const user = data?.me

    return [user, refetch, loading]
}