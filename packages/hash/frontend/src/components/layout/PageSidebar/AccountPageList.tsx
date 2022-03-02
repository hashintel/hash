import { VoidFunctionComponent } from "react";
// import Link from "next/link";

import { treeFromParentReferences } from "@hashintel/hash-shared/util";
import { TreeView } from "@mui/lab";
// import styles from "./PageSidebar.module.scss";
import { CreatePageButton } from "../../Modals/CreatePage/CreatePageButton";
import { useAccountPages } from "../../hooks/useAccountPages";
import { NavLink } from "./NavLink";
import { PageTreeItem } from "./PageTreeItem";

type AccountPageListProps = {
  accountId: string;
  // currentPageEntityId: string;
};

type TreeElement = {
  entityId: string;
  parentPageId: string;
  title: string;
  children?: TreeElement[];
};

const renderTree = (node: TreeElement) => (
  <PageTreeItem
    hasChildren={node.children ? node.children.length > 1 : false}
    key={node.entityId}
    nodeId={node.entityId}
    label={node.title}
  >
    {Array.isArray(node.children)
      ? node.children.map((child) => renderTree(child))
      : null}
  </PageTreeItem>
);

export const AccountPageList: VoidFunctionComponent<AccountPageListProps> = ({
  // currentPageEntityId,
  accountId,
}) => {
  const { data } = useAccountPages(accountId);

  const formattedData = treeFromParentReferences(
    data as TreeElement[],
    "entityId",
    "parentPageId",
    "children",
  );

  // @todo-mui implement active state
  return (
    <NavLink
      title="Pages"
      endAdornment={<CreatePageButton accountId={accountId} />}
    >
      <TreeView>{formattedData.map((node) => renderTree(node))}</TreeView>
    </NavLink>
  );

  // return (
  //   <div className={styles.SidebarList}>
  //     {data.map((page) => {
  //       if (page.entityId === currentPageEntityId) {
  //         return <div key={page.entityId}>{page.title}</div>;
  //       }
  //       return (
  //         <div key={page.entityId}>
  //           <Link href={`/${accountId}/${page.entityId}`}>
  //             <a>{page.title}</a>
  //           </Link>
  //         </div>
  //       );
  //     })}
  //     <CreatePageButton accountId={accountId} />
  //   </div>
  // );
};
