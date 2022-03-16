import React, { VoidFunctionComponent, SyntheticEvent, useMemo } from "react";
// import Link from "next/link";

import { treeFromParentReferences } from "@hashintel/hash-shared/util";
import { TreeView } from "@mui/lab";
import { useRouter } from "next/router";
import { CreatePageButton } from "./CreatePageButton";
import { useAccountPages } from "../../../hooks/useAccountPages";
import { NavLink } from "../NavLink";
import { PageTreeItem } from "./PageTreeItem";

type AccountPageListProps = {
  accountId: string;
  currentPageEntityId: string;
};

type TreeElement = {
  entityId: string;
  parentPageEntityId: string;
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
  currentPageEntityId,
  accountId,
}) => {
  const { data } = useAccountPages(accountId);
  const router = useRouter();

  const formattedData = useMemo(
    () =>
      treeFromParentReferences(
        data as TreeElement[],
        "entityId",
        "parentPageEntityId",
        "children",
      ),
    [data],
  );

  // @todo-mui implement active state
  return (
    <NavLink
      title="Pages"
      endAdornment={<CreatePageButton accountId={accountId} />}
    >
      <TreeView
        data-testid="pages-tree"
        sx={{
          mx: 0.5,
        }}
        selected={currentPageEntityId}
        onNodeSelect={(_: SyntheticEvent, pageEntityId: string) => {
          void router.push(`/${accountId}/${pageEntityId}`);
        }}
      >
        {formattedData.map((node) => renderTree(node))}
      </TreeView>
    </NavLink>
  );
};
