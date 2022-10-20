import { useApolloClient } from "@apollo/client";
import { ProsemirrorManager } from "@hashintel/hash-shared/ProsemirrorManager";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { Button } from "@hashintel/hash-design-system";
import Box from "@mui/material/Box";
import { useRouter } from "next/router";
import { Schema } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import { FunctionComponent, useLayoutEffect, useRef } from "react";
import { useLocalstorageState } from "rooks";
import { SxProps } from "@mui/system";
import { useCreateComment } from "../../components/hooks/useCreateComment";
import { PageThread } from "../../components/hooks/usePageComments";
import { useInitTypeSystem } from "../../lib/use-init-type-system";
import { useReadonlyMode } from "../../shared/readonly-mode";
import { BlockLoadedProvider } from "../onBlockLoaded";
import { UserBlocksProvider } from "../userBlocks";
import { EditorConnection } from "./collab/EditorConnection";
import { CommentThread } from "./Comments/CommentThread";
import { BlocksMap, createEditorView } from "./createEditorView";
import { usePageContext } from "./PageContext";
import {
  getPageSectionContainerStyles,
  PageSectionContainer,
} from "./PageSectionContainer";
import { usePortals } from "./usePortals";

type PageBlockProps = {
  contents: BlockEntity[];
  blocks: BlocksMap;
  pageComments: PageThread[];
  accountId: string;
  entityId: string;
};

/**
 * The naming of this as a "Block" is… interesting, considering it doesn't
 * really work like a Block. It would be cool to somehow detach the process of
 * rendering child blocks from this and have a renderer, but it seems tricky to
 * do that
 */
export const PageBlock: FunctionComponent<PageBlockProps> = ({
  contents,
  blocks,
  pageComments,
  accountId,
  entityId,
}) => {
  const loadingTypeSystem = useInitTypeSystem();
  const root = useRef<HTMLDivElement>(null);
  const client = useApolloClient();

  const [portals, renderPortal, clearPortals] = usePortals();
  const [debugging] = useLocalstorageState<
    { restartCollabButton?: boolean } | boolean
  >("hash.internal.debugging", false);

  const prosemirrorSetup = useRef<null | {
    view: EditorView<Schema>;
    connection: EditorConnection | null;
    manager: ProsemirrorManager;
  }>(null);

  const currentContents = useRef(contents);
  useLayoutEffect(() => {
    currentContents.current = contents;
  }, [contents]);

  const router = useRouter();
  const routeHash = router.asPath.split("#")[1] ?? "";
  const { readonlyMode } = useReadonlyMode();

  const [createComment, { loading: createCommentLoading }] =
    useCreateComment(entityId);

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
      () => currentContents.current,
      client,
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
      connection?.close();
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
    client,
  ]);

  return (
    <UserBlocksProvider value={blocks}>
      <BlockLoadedProvider routeHash={routeHash}>
        {loadingTypeSystem ? null : (
          <PageSectionContainer
            pageComments={pageComments}
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
                {pageComments?.map((comment) => (
                  <CommentThread
                    key={comment.entityId}
                    comment={comment}
                    createComment={createComment}
                    loading={createCommentLoading}
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
                getPageSectionContainerStyles(pageComments),
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
      </BlockLoadedProvider>
    </UserBlocksProvider>
  );
};
