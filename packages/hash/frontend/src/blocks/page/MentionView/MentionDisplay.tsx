import { useMemo, VFC } from "react";
import { tw } from "twind";
import Link from "next/link";
import ArticleIcon from "@mui/icons-material/Article";

import { useUsers } from "../../../components/hooks/useUsers";
import { useAccountPages } from "../../../components/hooks/useAccountPages";

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
        // If the users query is still loading, only display "User" as name
        let userName = "User";

        if (!usersLoading) {
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
        // If the pages query is still loading, only display "Page" as title
        let pageTitle = "Page";

        if (!pagesLoading) {
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
    <Link href={href}>
      <a>
        <span className={tw`text-gray-400 font-medium cursor-pointer`}>
          {icon}
          {title}
        </span>
      </a>
    </Link>
  );
};
