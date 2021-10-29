import { VoidFunctionComponent } from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client";

import { getAccountPages } from "../../../graphql/queries/account.queries";
import {
  GetAccountPagesQuery,
  GetAccountPagesQueryVariables,
} from "../../../graphql/apiTypes.gen";

import styles from "./PageSidebar.module.scss";
import { CreatePageButton } from "../../Modals/CreatePage/CreatePageButton";

type AccountPageListProps = {
  accountId: string;
  currentPageEntityId: string;
};

export const AccountPageList: VoidFunctionComponent<AccountPageListProps> = ({
  currentPageEntityId,
  accountId,
}) => {
  const { data } = useQuery<
    GetAccountPagesQuery,
    GetAccountPagesQueryVariables
  >(getAccountPages, {
    variables: { accountId },
  });

  return (
    <div className={styles.SidebarList}>
      {data?.accountPages.map((page) => {
        if (page.entityId === currentPageEntityId) {
          return <div key={page.id}>{page.properties.title}</div>;
        }
        return (
          <div key={page.id}>
            <Link href={`/${accountId}/${page.entityId}`}>
              <a>{page.properties.title}</a>
            </Link>
          </div>
        );
      })}
      <CreatePageButton accountId={accountId} />
    </div>
  );
};
