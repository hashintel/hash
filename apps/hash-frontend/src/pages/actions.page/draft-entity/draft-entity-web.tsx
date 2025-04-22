import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { FunctionComponent } from "react";
import { useMemo } from "react";

import { useOrgs } from "../../../components/hooks/use-orgs";
import { useUsers } from "../../../components/hooks/use-users";
import { UserIcon } from "../../../shared/icons/user-icon";
import { UsersRegularIcon } from "../../../shared/icons/users-regular-icon";
import { Link } from "../../../shared/ui";
import { useAuthenticatedUser } from "../../shared/auth-info-context";
import { DraftEntityChip } from "./draft-entity-chip";

export const DraftEntityWeb: FunctionComponent<{ entity: HashEntity }> = ({
  entity,
}) => {
  const webId = useMemo(
    () => extractWebIdFromEntityId(entity.metadata.recordId.entityId),
    [entity],
  );

  const { authenticatedUser } = useAuthenticatedUser();
  const { orgs } = useOrgs();
  const { users } = useUsers();

  const web = useMemo(() => {
    if (!orgs || !users) {
      return undefined;
    }

    const org = orgs.find(({ webId: idToFind }) => webId === idToFind);

    if (org) {
      return org;
    }

    if (authenticatedUser.accountId === webId) {
      return authenticatedUser;
    }

    const user = users.find(({ accountId }) => accountId === webId);

    if (user) {
      return user;
    }

    throw new Error(`Could not find web of draft entity with webId ${webId}`);
  }, [webId, orgs, users, authenticatedUser]);

  const label = useMemo(() => {
    if (!web) {
      return undefined;
    }

    return web.kind === "user"
      ? web.accountId === authenticatedUser.accountId
        ? "My Web"
        : (web.displayName ?? "Unknown User")
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
