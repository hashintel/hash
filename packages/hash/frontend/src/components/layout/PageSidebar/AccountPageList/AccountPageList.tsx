import React, { VoidFunctionComponent, SyntheticEvent, useMemo } from "react";

import { treeFromParentReferences } from "@hashintel/hash-shared/util";
import { TreeView } from "@mui/lab";
import { useRouter } from "next/router";
import { useModal } from "react-modal-hook";
import { useAccountPages } from "../../../hooks/useAccountPages";
import { NavLink } from "../NavLink";
import { PageTreeItem } from "./PageTreeItem";
import { CreatePageModal } from "../../../Modals/CreatePageModal";

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

const renderTree = (
  node: TreeElement,
  accountId: string,
  depth: number = 0,
) => {
  return (
    <PageTreeItem
      key={node.entityId}
      nodeId={node.entityId}
      label={node.title}
      depth={depth}
      ContentProps={
        {
          /**
           *  ContentProps type is currently limited to HtmlAttributes and unfortunately can't be augmented
           *  Casting the type to any as a temporary workaround
           * @see https://stackoverflow.com/a/69483286
           * @see https://github.com/mui/material-ui/issues/28668
           */
          expandable: Boolean(
            Array.isArray(node.children) ? node.children.length : node.children,
          ),
          pageUrl: `/${accountId}/${node.entityId}`,
          depth,
        } as any
      }
    >
      {Array.isArray(node.children)
        ? node.children.map((child) => renderTree(child, accountId, depth + 1))
        : null}
    </PageTreeItem>
  );
};

export const AccountPageList: VoidFunctionComponent<AccountPageListProps> = ({
  currentPageEntityId,
  accountId,
}) => {
  const { data } = useAccountPages(accountId);
  const router = useRouter();
  const [showCreatePageModal, hideCreatePageModal] = useModal(() => (
    <CreatePageModal accountId={accountId} show onClose={hideCreatePageModal} />
  ));

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

  return (
    <NavLink
      title="Pages"
      endAdornmentProps={{
        tooltipTitle: "Create new Page",
        onClick: showCreatePageModal,
        "data-testid": "create-page-btn",
      }}
    >
      <TreeView
        data-testid="pages-tree"
        tabIndex={-1}
        sx={{
          mx: 0.5,
        }}
        selected={currentPageEntityId}
        onNodeSelect={(_: SyntheticEvent, pageEntityId: string) => {
          void router.push(`/${accountId}/${pageEntityId}`);
        }}
      >
        {formattedData.map((node) => renderTree(node, accountId, 0))}
      </TreeView>
    </NavLink>
  );
};
