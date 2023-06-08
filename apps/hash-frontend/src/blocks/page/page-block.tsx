import "prosemirror-view/style/prosemirror.css";

import { useApolloClient } from "@apollo/client";
import { Button } from "@hashintel/design-system";
import { ProsemirrorManager } from "@local/hash-isomorphic-utils/prosemirror-manager";
import { AccountId, EntityId } from "@local/hash-subgraph";
import { Box } from "@mui/material";
import { SxProps } from "@mui/system";
import { EditorView } from "prosemirror-view";
import { FunctionComponent, useLayoutEffect, useRef } from "react";
import { useLocalstorageState } from "rooks";

import { PageThread } from "../../components/hooks/use-page-comments";
import { PageContentItem } from "../../graphql/api-types.gen";
import { useIsReadonlyModeForResource } from "../../shared/readonly-mode";
import { useUserBlocks } from "../user-blocks";
import { usePortals } from "./block-portals";
import { EditorConnection } from "./collab/editor-connection";
import { CommentThread } from "./comments/comment-thread";
import { createEditorView } from "./create-editor-view";
import { usePageContext } from "./page-context";
import {
  getPageSectionContainerStyles,
  PageSectionContainer,
} from "./page-section-container";

type PageBlockProps = {
  contents: PageContentItem[];
  pageComments: PageThread[];
  accountId: AccountId;
  entityId: EntityId;
};

/**
 * The naming of this as a "Block" is… interesting, considering it doesn't
 * really work like a Block. It would be cool to somehow detach the process of
 * rendering child blocks from this and have a renderer, but it seems tricky to
 * do that
 */
export const PageBlock: FunctionComponent<PageBlockProps> = ({
  contents,
  pageComments,
  accountId,
  entityId,
}) => {
  const root = useRef<HTMLDivElement>(null);
  const client = useApolloClient();

  const [portals, renderPortal, clearPortals] = usePortals();
  const [debugging] = useLocalstorageState<
    { restartCollabButton?: boolean } | boolean
  >("hash.internal.debugging", false);

  const prosemirrorSetup = useRef<null | {
    view: EditorView;
    connection: EditorConnection | null;
    manager: ProsemirrorManager;
  }>(null);

  const currentContents = useRef(contents);
  useLayoutEffect(() => {
    currentContents.current = contents;
  }, [contents]);

  const { value: newestBlocks } = useUserBlocks();
  const currentBlocks = useRef(newestBlocks);
  useLayoutEffect(() => {
    currentBlocks.current = newestBlocks;
  }, [newestBlocks]);

  const isReadonlyMode = useIsReadonlyModeForResource(accountId);

  const { setEditorContext, pageTitleRef } = usePageContext();

  /**
   * This effect runs once and just sets up the prosemirror instance. It is not
   * responsible for setting the contents of the prosemirror document
   */
  useLayoutEffect(() => {
    const node = root.current!;

    /**
     * Lets see up prosemirror with an empty document, as another effect will
     * set its contents. Unfortunately all prosemirror documents have to
     * contain at least one child, so lets insert a special "blank" placeholder
     * child
     */
    const { view, connection, manager } = createEditorView(
      node,
      renderPortal,
      accountId,
      entityId,
      () => currentBlocks.current,
      isReadonlyMode,
      pageTitleRef,
      () =>
        currentContents.current.map((contentItem) => contentItem.rightEntity),
      client,
    );

    setEditorContext({ view, manager });

    prosemirrorSetup.current = {
      view,
      connection: connection ?? null,
      manager,
    };

    return () => {
      clearPortals();
      view.destroy();
      connection?.close();
      prosemirrorSetup.current = null;
    };
  }, [
    accountId,
    currentBlocks,
    entityId,
    renderPortal,
    isReadonlyMode,
    clearPortals,
    setEditorContext,
    pageTitleRef,
    client,
  ]);

  return (
    <>
      {isReadonlyMode ? null : (
        <PageSectionContainer
          pageComments={pageComments}
          readonly={isReadonlyMode}
          sx={{
            position: "absolute",
            top: 0,
            right: 0,
            left: 0,
            width: "100%",
          }}
        >
          <Box width="100%" position="relative">
            <Box
              sx={{
                position: "absolute",
                top: 16,
                left: "calc(100% + 48px)",
                zIndex: 1,
              }}
            >
              {pageComments.map((comment) => (
                <CommentThread
                  key={comment.metadata.recordId.entityId}
                  pageId={entityId}
                  comment={comment}
                />
              ))}
            </Box>
          </Box>
        </PageSectionContainer>
      )}
      <Box
        id="root"
        ref={root}
        sx={
          {
            /**
             * to handle margin-clicking, prosemirror should take full width, and give padding to it's content
             * so it automatically handles focusing on closest node on margin-clicking
             */
            ".ProseMirror": [
              getPageSectionContainerStyles(pageComments, isReadonlyMode),
              { paddingTop: 0, paddingBottom: "320px" },
            ],
            // prevents blue outline on selected nodes
            ".ProseMirror-selectednode": { outline: "none" },
          } as SxProps
        }
      />
      {portals}
      {/**
       * @todo position this better
       */}
      {(
        typeof debugging === "boolean"
          ? debugging
          : debugging.restartCollabButton
      ) ? (
        <Button
          sx={{
            position: "fixed",
            bottom: 2.5,
            right: 2.5,
            opacity: 0.3,

            "&:hover": {
              opacity: 1,
            },
          }}
          onClick={() => {
            prosemirrorSetup.current?.connection?.restart();
          }}
        >
          Restart Collab Instance
        </Button>
      ) : null}
    </>
  );
};
