import { useMemo, VFC } from "react";
import { tw } from "twind";
import Link from "next/link";

import { useAccountInfos } from "../../../components/hooks/useAccountInfos";
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
  const { data: accounts } = useAccountInfos();
  const { data: pages } = useAccountPages(accountId);

  const { title, href } = useMemo(() => {
    const getPageData = (pageEntityId: string) => {
      const foundPage = pages?.accountPages.find(
        (page) => page.entityId === pageEntityId,
      ) ?? {
        properties: {
          title: "",
        },
      };

      const pageTitle = foundPage.properties.title;

      return {
        title: pageTitle,
        href: `/${accountId}/${pageEntityId}`,
      };
    };

    switch (mentionType) {
      case "user":
        return {
          title:
            accounts.find((item) => item.entityId === entityId)?.name ?? "",
          href: `/${entityId}`,
        };
      case "page":
        return getPageData(entityId);
      default:
        return { title: "", href: "" };
    }
  }, [accountId, entityId, mentionType, accounts, pages]);

  return (
    <Link href={href}>
      <a>
        <span className={tw`text-gray-400 font-medium cursor-pointer`}>
          @{title}
        </span>
      </a>
    </Link>
  );
};
