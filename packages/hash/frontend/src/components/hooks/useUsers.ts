import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { GetAccountsQuery } from "../../graphql/apiTypes.gen";
import { getAccounts } from "../../graphql/queries/account.queries";

export const useUsers = (): {
  loading: boolean;
  data: { entityId: string; shortname: string; name: string }[];
} => {
  const { data, loading } = useQuery<GetAccountsQuery>(getAccounts);

  const accounts = useMemo(() => {
    if (!data) return [];
    /**
     * Filter out org accounts
     * org accounts do not have "preferredName" in their properties object
     */
    const userAccounts = data.accounts.filter(
      (account) => "preferredName" in account.properties,
    );

    return userAccounts.map((account) => {
      return {
        entityId: account.entityId,
        shortname: account.properties.shortname!,
        name:
          "preferredName" in account.properties
            ? account.properties.preferredName!
            : account.properties.shortname!,
      };
    });
  }, [data]);

  return {
    loading,
    data: accounts,
  };
};
