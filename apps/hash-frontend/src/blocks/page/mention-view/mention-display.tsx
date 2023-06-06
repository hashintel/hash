import { systemUserShortname } from "@local/hash-isomorphic-utils/environment";
import {
  AccountId,
  EntityId,
  EntityUuid,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
  OwnedById,
  Uuid,
} from "@local/hash-subgraph";
import { FunctionComponent, useMemo } from "react";

import { useAccountPages } from "../../../components/hooks/use-account-pages";
import { useEntityById } from "../../../components/hooks/use-entity-by-id";
import { useUsers } from "../../../components/hooks/use-users";
import { useWorkspaceShortnameByEntityUuid } from "../../../components/hooks/use-workspace-shortname-by-entity-uuid";
import { PageIcon } from "../../../components/page-icon";
import { generateEntityLabel } from "../../../lib/entities";
import { constructPageRelativeUrl } from "../../../lib/routes";
import { Link } from "../../../shared/ui";
import { MentionType } from "../create-suggester/mention-suggester";

interface MentionDisplayProps {
  entityId: EntityId;
  mentionType: MentionType;
  accountId: AccountId;
}

export const MentionDisplay: FunctionComponent<MentionDisplayProps> = ({
  entityId,
  mentionType,
  accountId,
}) => {
  const { users, loading: usersLoading } = useUsers(true);
  const { data: pages, loading: pagesLoading } = useAccountPages(
    accountId as OwnedById,
  );
  const { loading: entityLoading, entitySubgraph } = useEntityById(entityId);

  const { workspaceShortname, loading: workspaceShortnameLoading } =
    useWorkspaceShortnameByEntityUuid({
      entityUuid: extractOwnedByIdFromEntityId(entityId) as Uuid as EntityUuid,
      // no need to call this hook if the mention type is not an entity, see below to see how shortname is generated for other mention types
      disabled: mentionType !== "entity",
    });

  const { title, href, icon } = useMemo(() => {
    switch (mentionType) {
      case "user": {
        // User entities are stored on the system account
        const userHref = `/@${systemUserShortname}/entities/${extractEntityUuidFromEntityId(
          entityId,
        )}`;

        // Only set the title to "User" if the query hasn't returned yet
        if (!users || (usersLoading && !users.length)) {
          /** @todo - What should the href be here? */
          return {
            title: "User",
            href: userHref,
            icon: "@",
          };
        }

        // Once the query loads, either display the found name, or display "Unknown User" if the user doesn't exist in the users array
        const matchingUser = users.find(
          (user) => user.entityRecordId.entityId === entityId,
        );

        if (matchingUser) {
          return {
            title: matchingUser.preferredName,
            href: userHref,
            icon: "@",
          };
        }

        /** @todo - What should the href be here? */
        return {
          title: "Unknown User",
          href: `#`,
          icon: "@",
        };
      }

      case "page": {
        const page = pages.find(
          (potentialPage) => potentialPage.entityId === entityId,
        );

        let pageTitle = "";

        // Only set the title to "Page" if the query hasn't returned yet
        if (pagesLoading && !pages.length) {
          pageTitle = "Page";
        } else {
          // Once the query loads, either display the found title, or display "Unknown Page" if the page doesn't exist in the page array
          pageTitle = page?.title ?? "Unknown Page";
        }

        const pageEntityUuid = extractEntityUuidFromEntityId(entityId);

        return {
          title: pageTitle || "Untitled",
          href: page
            ? constructPageRelativeUrl({
                workspaceShortname: page.ownerShortname,
                pageEntityUuid,
              })
            : "",
          icon: (
            <PageIcon
              entityId={entityId}
              size="small"
              sx={{ display: "inline-flex", mr: 0.25 }}
            />
          ),
        };
      }
      case "entity": {
        if (!entitySubgraph || entityLoading || workspaceShortnameLoading) {
          /** @todo consider showing a loading state instead of saying "entity", same for the pages & users above */
          return {
            title: "Entity",
            href: "",
            icon: "@",
          };
        }

        const entityHref = `/@${workspaceShortname}/entities/${extractEntityUuidFromEntityId(
          entityId,
        )}`;

        const entityLabel = generateEntityLabel(entitySubgraph);

        return {
          title: entityLabel,
          href: entityHref,
          icon: "@",
        };
      }
      default:
        return { title: "", href: "", icon: "@" };
    }
  }, [
    entityId,
    mentionType,
    users,
    pages,
    pagesLoading,
    usersLoading,
    entitySubgraph,
    entityLoading,
    workspaceShortname,
    workspaceShortnameLoading,
  ]);

  return (
    <Link noLinkStyle href={href} sx={{ fontWeight: 500, color: "#9ca3af" }}>
      {icon}
      {title}
    </Link>
  );
};
