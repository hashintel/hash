import { useRouter } from "next/router";
import { useMemo } from "react";
import { extractEntityUuidFromEntityId } from "@hashintel/hash-subgraph";
import { useAuthenticatedUser } from "../../../../components/hooks/useAuthenticatedUser";

export const useRouteNamespace = (): {
  accountId: string;
  shortname?: string;
} | undefined => {
  const { authenticatedUser } = useAuthenticatedUser();
  const router = useRouter();

  const shortname = router.query["account-slug"];

  const namespace = useMemo(() => {
    let entity;

    if (authenticatedUser) {
      if (shortname === `@${authenticatedUser.shortname}`) {
        entity = authenticatedUser;
      } else {
        entity = authenticatedUser.memberOf?.find(
          (org) => `@${org.shortname}` === shortname,
        );
      }

      if (entity) {
        return {
          accountId: extractEntityUuidFromEntityId(
            entity.entityEditionId.baseId,
          ),
          shortname: entity.shortname,
        };
      }
    }
  }, [authenticatedUser, shortname]);

  return namespace;
};
