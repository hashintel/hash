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
  const { data: users } = useUsers();
  const { data: pages } = useAccountPages(accountId);

  const { title, href, icon } = useMemo(() => {
    const getPageData = (pageEntityId: string) => {
      const foundPage = pages.find(
        (page) => page.entityId === pageEntityId,
      ) ?? {
        title: "",
      };

      const pageTitle = foundPage.title;

      return {
        title: pageTitle,
        href: `/${accountId}/${pageEntityId}`,
        icon: <ArticleIcon style={{ fontSize: "1em" }} />,
      };
    };

    switch (mentionType) {
      case "user":
        return {
          title:
            users.find((item) => item.entityId === entityId)?.name ?? "",
          href: `/${entityId}`,
          icon: "@",
        };
      case "page":
        return getPageData(entityId);
      default:
        return { title: "", href: "", icon: "@" };
    }
  }, [accountId, entityId, mentionType, users, pages]);

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
