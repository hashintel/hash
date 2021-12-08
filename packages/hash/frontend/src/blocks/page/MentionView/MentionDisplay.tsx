import { useMemo, VFC } from "react";
import { tw } from "twind";
import Link from "next/link";
import { useAccountInfos } from "../../../components/hooks/useAccountInfos";
import { useQuery } from "@apollo/client";

import {
  GetAccountPagesQuery,
  GetAccountPagesQueryVariables,
} from "../../../graphql/apiTypes.gen";
import { getAccountPages } from "../../../graphql/queries/account.queries";

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
  const { data: pages } = useQuery<
    GetAccountPagesQuery,
    GetAccountPagesQueryVariables
  >(getAccountPages, {
    variables: { accountId },
  });

  const { title, href } = useMemo(() => {
    switch (mentionType) {
      case "user":
        return {
          title:
            accounts.find((item) => item.entityId === entityId)?.name ?? "",
          href: `/${entityId}`,
        };
      case "page":
        const foundPage = pages?.accountPages.find(
          (page) => page.entityId === entityId,
        ) ?? {
          properties: {
            title: "",
          },
          entityId,
        };

        console.log(foundPage);

        const pageTitle = foundPage.properties.title;

        return {
          title: pageTitle,
          href: `/${accountId}/${entityId}`,
        };
      default:
        return { title: "", href: "" };
    }
  }, [entityId, mentionType, accounts, pages]);

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
