import React, {
  VoidFunctionComponent,
  SyntheticEvent,
  useMemo,
  useState,
  useCallback,
} from "react";

import { treeFromParentReferences } from "@hashintel/hash-shared/util";
import { TreeView } from "@mui/lab";
import { useRouter } from "next/router";
import { useLocalstorageState } from "rooks";
import { useAccountPages } from "../../../components/hooks/useAccountPages";
import { useCreatePage } from "../../../components/hooks/useCreatePage";
import { NavLink } from "./nav-link";
import { PageTreeItem } from "./account-page-list/page-tree-item";

type AccountPageListProps = {
  accountId: string;
  currentPageEntityId?: string;
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
          url: `/${accountId}/${node.entityId}`,
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
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useLocalstorageState<string[]>(
    "hash-expanded-sidebar-pages",
    [],
  );

  const { createUntitledPage } = useCreatePage(accountId);

  // @todo handle loading/error states properly
  const addPage = useCallback(async () => {
    if (loading) {
      return;
    }

    setLoading(true);
    try {
      await createUntitledPage();
    } catch (err) {
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.error("Could not create page: ", err);
    } finally {
      setLoading(false);
    }
  }, [createUntitledPage, loading]);

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

  const handleSelect = (_: SyntheticEvent, pageEntityId: string) => {
    void router.push(`/${accountId}/${pageEntityId}`);
  };

  const handleToggle = (_: SyntheticEvent, nodeIds: string[]) => {
    setExpanded(nodeIds);
  };

  return (
    <NavLink
      title="Pages"
      endAdornmentProps={{
        tooltipTitle: "Create new Page",
        onClick: addPage,
        "data-testid": "create-page-btn",
      }}
    >
      <TreeView
        data-testid="pages-tree"
        tabIndex={-1}
        sx={{
          mx: 0.75,
        }}
        {...(currentPageEntityId && { selected: currentPageEntityId })}
        expanded={expanded}
        onNodeToggle={handleToggle}
        onNodeSelect={handleSelect}
      >
        {formattedData.map((node) => renderTree(node, accountId, 0))}
      </TreeView>
    </NavLink>
  );
};
