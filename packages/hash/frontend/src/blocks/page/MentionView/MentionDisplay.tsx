import { useMemo, VFC } from "react";
import { tw } from "twind";
import ArticleIcon from "@mui/icons-material/Article";

import { useUsers } from "../../../components/hooks/useUsers";
import { useAccountPages } from "../../../components/hooks/useAccountPages";
import { Link } from "../../../shared/ui";

interface MentionDisplayProps {
  entityId: string;
  mentionType: string;
  accountId: string;
}

export const MentionDisplay: VFC<MentionDisplayProps> = ({
  entityId,
  mentionType,
  accountId,
}) => {
  const { data: users, loading: usersLoading } = useUsers();
  const { data: pages, loading: pagesLoading } = useAccountPages(accountId);

  const { title, href, icon } = useMemo(() => {
    switch (mentionType) {
      case "user": {
        let userName = "";

        // Only set username to "User" if the query hasn't already run before
        if (usersLoading && !users.length) {
          userName = "User";
        } else {
          // Once the query loads, either display the found name, or display "Unknown User" if the user doesn't exist in the users array
          userName =
            users.find((item) => item.entityId === entityId)?.name ??
            "Unknown User";
        }

        return {
          title: userName,
          href: `/${entityId}`,
          icon: "@",
        };
      }
      case "page": {
        let pageTitle = "";

        // Only set the title to "Page" if the query hasn't run before
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
          href: `/${accountId}/${entityId}`,
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
    usersLoading,
    pages,
    pagesLoading,
  ]);

  return (
    <Link noLinkStyle href={href}>
      <a>
        <span className={tw`text-gray-400 font-medium cursor-pointer`}>
          {icon}
          {title}
        </span>
      </a>
    </Link>
  );
};
