import { VoidFunctionComponent } from "react";
import Link from "next/link";

import styles from "./PageSidebar.module.scss";
import { CreatePageButton } from "../../Modals/CreatePage/CreatePageButton";
import { useAccountPages } from "../../hooks/useAccountPages";

type AccountPageListProps = {
  accountId: string;
  currentPageEntityId: string;
};

export const AccountPageList: VoidFunctionComponent<AccountPageListProps> = ({
  currentPageEntityId,
  accountId,
}) => {
  const { data } = useAccountPages(accountId);

  return (
    <div className={styles.SidebarList}>
      {data.map((page) => {
        if (page.entityId === currentPageEntityId) {
          return <div key={page.id}>{page.title}</div>;
        }
        return (
          <div key={page.id}>
            <Link href={`/${accountId}/${page.entityId}`}>
              <a>{page.title}</a>
            </Link>
          </div>
        );
      })}
      <CreatePageButton accountId={accountId} />
    </div>
  );
};
