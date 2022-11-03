import { useRouter } from "next/router";
import { useMemo } from "react";
import { useAuthenticatedUser } from "../../../../components/hooks/useAuthenticatedUser";

export const useRouteNamespace = () => {
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
          id: entity.entityId,
          shortname: entity.shortname,
        };
      }
    }
  }, [authenticatedUser, shortname, router]);

  return namespace;
};
