import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { useUser } from "./useUser";
import { GetAccountsQuery } from "../../graphql/apiTypes.gen";
import { getAccounts } from "../../graphql/queries/account.queries";
import { useRouteAccountInfo } from "../../shared/routing";

export const useUsers = (): {
  loading: boolean;
  data: { entityId: string; shortname: string; name: string }[];
} => {
  const { data, loading } = useQuery<GetAccountsQuery>(getAccounts);
  const { accountId: workspaceAccountId } = useRouteAccountInfo();
  const { user } = useUser();

  const accounts = useMemo(() => {
    // If user is in their workspace return user
    if (user?.accountId === workspaceAccountId) {
      return [
        {
          entityId: user.entityId,
          shortname: user.properties.shortname!,
          name:
            "preferredName" in user.properties
              ? user.properties.preferredName!
              : user.properties.shortname!,
        },
      ];
    }

    // if user is in their org's workspace, return members
    const orgMembers =
      data?.accounts.filter(
        (account) =>
          "memberOf" in account && // this also filters out orgs since they can't technically have `memberOf`
          account.memberOf?.some(
            ({ org }) => org.accountId === workspaceAccountId,
          ),
      ) ?? [];

    return orgMembers.map((account) => {
      return {
        entityId: account.entityId,
        shortname: account.properties.shortname!,
        name:
          "preferredName" in account.properties
            ? account.properties.preferredName!
            : account.properties.shortname!,
      };
    });
  }, [data, user, workspaceAccountId]);

  return {
    loading,
    data: accounts,
  };
};
