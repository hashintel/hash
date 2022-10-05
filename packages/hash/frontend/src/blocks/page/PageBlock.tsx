import { ProsemirrorManager } from "@hashintel/hash-shared/ProsemirrorManager";
import { useRouter } from "next/router";
import { Schema } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import { useLayoutEffect, useRef, FunctionComponent } from "react";
import { useLocalstorageState } from "rooks";

import { Button } from "@hashintel/hash-design-system";
import Box from "@mui/material/Box";
import { GlobalStyles } from "@mui/material";
import { BlockLoadedProvider } from "../onBlockLoaded";
import { UserBlocksProvider } from "../userBlocks";
import { EditorConnection } from "./collab/EditorConnection";
import { BlocksMap, createEditorView } from "./createEditorView";
import { usePortals } from "./usePortals";
import { useReadonlyMode } from "../../shared/readonly-mode";
import { usePageContext } from "./PageContext";
import { PageCommentsProvider } from "../pageComments";
import { CommentThread } from "./Comments/CommentThread";
import { usePageComments } from "../../components/hooks/usePageComments";
import { useCreateComment } from "../../components/hooks/useCreateComment";

type PageBlockProps = {
  blocks: BlocksMap;
  accountId: string;
  entityId: string;
};

export const PAGE_CONTENT_WIDTH = 696;
export const PAGE_MIN_PADDING = 48;
export const COMMENTS_WIDTH = 320;
export const PAGE_HORIZONTAL_PADDING_LEFT_FORMULA = `max(calc((100% - ${
  PAGE_CONTENT_WIDTH + COMMENTS_WIDTH
}px) / 2), ${PAGE_MIN_PADDING}px)`;
export const PAGE_HORIZONTAL_PADDING_RIGHT_FORMULA = `max(calc((100% - ${
  PAGE_CONTENT_WIDTH + COMMENTS_WIDTH
}px) / 2), ${PAGE_MIN_PADDING * 2 + COMMENTS_WIDTH}px)`;

/**
 * The naming of this as a "Block" is… interesting, considering it doesn't
 * really work like a Block. It would be cool to somehow detach the process of
 * rendering child blocks from this and have a renderer, but it seems tricky to
 * do that
 */
export const PageBlock: FunctionComponent<PageBlockProps> = ({
  blocks,
  accountId,
  entityId,
}) => {
  const root = useRef<HTMLDivElement>(null);
  const [portals, renderPortal, clearPortals] = usePortals();
  const [debugging] = useLocalstorageState<
    { restartCollabButton?: boolean } | boolean
  >("hash.internal.debugging", false);

  const prosemirrorSetup = useRef<null | {
    view: EditorView<Schema>;
    connection: EditorConnection | null;
    manager: ProsemirrorManager;
  }>(null);

  const router = useRouter();
  const routeHash = router.asPath.split("#")[1] ?? "";
  const { readonlyMode } = useReadonlyMode();

  const { data: pageComments } = usePageComments(accountId, entityId);
  const [createComment] = useCreateComment(accountId, entityId);

  const { setEditorView, pageTitleRef } = usePageContext();

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
      blocks,
      readonlyMode,
      pageTitleRef,
    );

    setEditorView(view);

    prosemirrorSetup.current = {
      view,
      connection: connection ?? null,
      manager,
    };

    return () => {
      clearPortals();
      view.destroy();
      connection.close();
      prosemirrorSetup.current = null;
    };
  }, [
    accountId,
    blocks,
    entityId,
    renderPortal,
    readonlyMode,
    clearPortals,
    setEditorView,
    pageTitleRef,
  ]);

  return (
    <UserBlocksProvider value={blocks}>
      <BlockLoadedProvider routeHash={routeHash}>
        <PageCommentsProvider accountId={accountId} pageId={entityId}>
          <GlobalStyles
            styles={{
              /**
               * to handle margin-clicking, prosemirror should take full width, and give padding to it's content
               * so it automatically handles focusing on closest node on margin-clicking
               */
              ".ProseMirror": {
                padding: `0 ${PAGE_HORIZONTAL_PADDING_RIGHT_FORMULA} 320px ${PAGE_HORIZONTAL_PADDING_LEFT_FORMULA}`,
                minWidth: `calc(${PAGE_CONTENT_WIDTH}px + (${PAGE_MIN_PADDING}px * 2))`,
              },
              // prevents blue outline on selected nodes
              ".ProseMirror-selectednode": { outline: "none" },
            }}
          />
          <Box id="root" ref={root} position="relative">
            <Box
              sx={{
                position: "absolute",
                right: PAGE_HORIZONTAL_PADDING_RIGHT_FORMULA,
                transform: "translateX(calc(100% + 48px))",
              }}
            >
              {pageComments?.map((comment) => (
                <CommentThread
                  key={comment.entityId}
                  comment={comment}
                  onSubmit={createComment}
                />
              ))}
            </Box>
          </Box>
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
        </PageCommentsProvider>
      </BlockLoadedProvider>
    </UserBlocksProvider>
  );
};
