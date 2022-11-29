import { useMemo, FunctionComponent } from "react";
import ArticleIcon from "@mui/icons-material/Article";

import {
  EntityId,
  extractEntityUuidFromEntityId,
} from "@hashintel/hash-subgraph";
import { SYSTEM_ACCOUNT_SHORTNAME } from "@hashintel/hash-shared/environment";
import { useUsers } from "../../../components/hooks/useUsers";
import { useAccountPages } from "../../../components/hooks/useAccountPages";
import { Link } from "../../../shared/ui";

interface MentionDisplayProps {
  entityId: EntityId;
  mentionType: "page" | "user";
  accountId: string;
}

export const MentionDisplay: FunctionComponent<MentionDisplayProps> = ({
  entityId,
  mentionType,
  accountId,
}) => {
  const { users, loading: usersLoading } = useUsers();
  const { data: pages, loading: pagesLoading } = useAccountPages(accountId);

  const { title, href, icon } = useMemo(() => {
    switch (mentionType) {
      case "user": {
        // User entities are stored on the system account
        const userHref = `/@${SYSTEM_ACCOUNT_SHORTNAME}/entities/${extractEntityUuidFromEntityId(
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
        let pageTitle = "";

        // Only set the title to "Page" if the query hasn't returned yet
        if (pagesLoading && !pages.length) {
          pageTitle = "Page";
        } else {
          // Once the query loads, either display the found title, or display "Unknown Page" if the page doesn't exist in the page array
          pageTitle =
            pages.find((page) => page.entityId === entityId)?.title ??
            "Unknown Page";
        }

        return {
          title: pageTitle,
          href: `/${accountId}/${extractEntityUuidFromEntityId(entityId)}`,
          icon: <ArticleIcon style={{ fontSize: "1em" }} />,
        };
      }
      default:
        return { title: "", href: "", icon: "@" };
    }
  }, [
    accountId,
    entityId,
    mentionType,
    users,
    pages,
    pagesLoading,
    usersLoading,
  ]);

  return (
    <Link noLinkStyle href={href} sx={{ fontWeight: 500, color: "#9ca3af" }}>
      {icon}
      {title}
    </Link>
  );
};
