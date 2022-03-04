import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { GetAccountsQuery, OrgProperties } from "../../graphql/apiTypes.gen";
import { getAccounts } from "../../graphql/queries/account.queries";

/**
 * Retrieves a list of organizations.
 * @todo the API should provide this, and it should only be available to admins.
 *    users should only see a list of orgs they are a member of.
 */
export const useOrgs = (): {
  loading: boolean;
  data: { entityId: string; shortname: string; name: string }[];
} => {
  const { data, loading } = useQuery<GetAccountsQuery>(getAccounts);

  const accounts = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.accounts
      .filter((account) => !("preferredName" in account.properties))
      .map((account) => ({
        entityId: account.entityId,
        shortname: account.properties.shortname!,
        name: (account.properties as OrgProperties).name,
      }));
  }, [data]);

  return {
    loading,
    data: accounts,
  };
};
