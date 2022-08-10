import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { GetAccountsQuery } from "../../graphql/apiTypes.gen";
import { getAccounts } from "../../graphql/queries/account.queries";
import { useRouteAccountInfo } from "../../shared/routing";

export const useUsers = (): {
  loading: boolean;
  data: {
    entityId: string;
    shortname: string;
    name: string;
    isActiveOrgMember: boolean;
  }[];
} => {
  const { data, loading } = useQuery<GetAccountsQuery>(getAccounts);
  const { accountId: workspaceAccountId } = useRouteAccountInfo();

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
        isActiveOrgMember:
          "memberOf" in account &&
          account.memberOf.some(
            ({ org }) => org.accountId === workspaceAccountId,
          ),
      };
    });
  }, [data, workspaceAccountId]);

  return {
    loading,
    data: accounts,
  };
};
