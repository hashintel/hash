import { systemUserShortname } from "@local/hash-isomorphic-utils/environment";
import { AccountId, OwnedById } from "@local/hash-isomorphic-utils/types";
import { EntityId, extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import ArticleIcon from "@mui/icons-material/Article";
import { FunctionComponent, useMemo } from "react";

import { useAccountPages } from "../../../components/hooks/use-account-pages";
import { useUsers } from "../../../components/hooks/use-users";
import { constructPageRelativeUrl } from "../../../lib/routes";
import { Link } from "../../../shared/ui";

interface MentionDisplayProps {
  entityId: EntityId;
  mentionType: "page" | "user";
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
        } else {
          // Once the query loads, either display the found name, or display "Unknown User" if the user doesn't exist in the users array
          const matchingUser = users.find(
            (user) => user.entityEditionId.baseId === entityId,
          );

          if (matchingUser) {
            return {
              title: matchingUser.preferredName,
              href: userHref,
              icon: "@",
            };
          } else {
            /** @todo - What should the href be here? */
            return {
              title: "Unknown User",
              href: `#`,
              icon: "@",
            };
          }
        }
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
          title: pageTitle,
          href: page
            ? constructPageRelativeUrl({
                workspaceShortname: page.ownerShortname,
                pageEntityUuid,
              })
            : "",
          icon: <ArticleIcon style={{ fontSize: "1em" }} />,
        };
      }
      default:
        return { title: "", href: "", icon: "@" };
    }
  }, [entityId, mentionType, users, pages, pagesLoading, usersLoading]);

  return (
    <Link noLinkStyle href={href} sx={{ fontWeight: 500, color: "#9ca3af" }}>
      {icon}
      {title}
    </Link>
  );
};
