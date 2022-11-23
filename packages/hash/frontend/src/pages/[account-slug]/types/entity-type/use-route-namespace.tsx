import { useRouter } from "next/router";
import { useMemo } from "react";
import { useAuthenticatedUser } from "../../../../components/hooks/useAuthenticatedUser";

export const useRouteNamespace = ():
  | {
      accountId: string;
      shortname?: string;
    }
  | undefined => {
  const { authenticatedUser } = useAuthenticatedUser();
  const router = useRouter();

  const shortname = router.query["account-slug"];

  const namespace = useMemo(() => {
    let accountShortname;
    let accountId;

    if (authenticatedUser) {
      if (shortname === `@${authenticatedUser.shortname}`) {
        accountShortname = authenticatedUser.shortname;
        accountId = authenticatedUser.userAccountId;
      } else {
        const org = authenticatedUser.memberOf?.find(
          (potentialOrg) => `@${potentialOrg.shortname}` === shortname,
        );

        accountShortname = org?.shortname;
        accountId = org?.orgAccountId;
      }

      if (accountShortname && accountId) {
        return {
          accountId,
          shortname: accountShortname,
        };
      }
    }
  }, [authenticatedUser, shortname]);

  return namespace;
};
