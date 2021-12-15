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
    switch (mentionType) {
      case "user":
        return {
          title:
            users.find((item) => item.entityId === entityId)?.name ?? "User",
          href: `/${entityId}`,
          icon: "@",
        };
      case "page":
        return {
          title: pages.find((page) => page.entityId === entityId) ?? "Page",
          href: `/${accountId}/${entityId}`,
          icon: <ArticleIcon style={{ fontSize: "1em" }} />,
        };
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
