import { Entity, extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { FunctionComponent, useMemo } from "react";

import { useOrgs } from "../../../components/hooks/use-orgs";
import { useUsers } from "../../../components/hooks/use-users";
import { UserIcon } from "../../../shared/icons/user-icon";
import { UsersRegularIcon } from "../../../shared/icons/users-regular-icon";
import { Link } from "../../../shared/ui";
import { useAuthenticatedUser } from "../../shared/auth-info-context";
import { DraftEntityChip } from "./draft-entity-chip";

export const DraftEntityWeb: FunctionComponent<{ entity: Entity }> = ({
  entity,
}) => {
  const ownedById = useMemo(
    () => extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId),
    [entity],
  );

  const { authenticatedUser } = useAuthenticatedUser();
  const { orgs } = useOrgs();
  const { users } = useUsers();

  const web = useMemo(() => {
    if (!orgs || !users) {
      return undefined;
    }

    const org = orgs.find(({ accountGroupId }) => accountGroupId === ownedById);

    if (org) {
      return org;
    }

    if (authenticatedUser.accountId === ownedById) {
      return authenticatedUser;
    }

    const user = users.find(({ accountId }) => accountId === ownedById);

    if (user) {
      return user;
    }

    throw new Error(
      `Could not find web of draft entity with ownedById ${ownedById}`,
    );
  }, [ownedById, orgs, users, authenticatedUser]);

  const label = useMemo(() => {
    if (!web) {
      return undefined;
    }

    return web.kind === "user"
      ? web.accountId === authenticatedUser.accountId
        ? "My Web"
        : web.preferredName
          ? web.preferredName
          : "Unknown User"
      : web.name;
  }, [web, authenticatedUser]);

  if (!web) {
    return null;
  }

  return (
    <Link href={`/@${web.shortname}`}>
      <DraftEntityChip
        clickable
        icon={web.kind === "user" ? <UserIcon /> : <UsersRegularIcon />}
        label={label}
      />
    </Link>
  );
};
