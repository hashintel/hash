import "prosemirror-view/style/prosemirror.css";

import { useApolloClient } from "@apollo/client";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { BlockCollectionContentItem } from "@local/hash-isomorphic-utils/entity";
import type { ProsemirrorManager } from "@local/hash-isomorphic-utils/prosemirror-manager";
import type { BoxProps } from "@mui/material";
import { Box } from "@mui/material";
import type { EditorView } from "prosemirror-view";
import type { FunctionComponent } from "react";
import { useLayoutEffect, useRef } from "react";
import { useLocalstorageState } from "rooks";

import { useUserBlocks } from "../../../blocks/user-blocks";
import { useSnackbar } from "../../../components/hooks/use-snackbar";
import { Button } from "../../../shared/ui";
import { usePortals } from "./block-portals";
import type { EditorConnection } from "./collab/editor-connection";
import { createEditorView } from "./create-editor-view";
import { usePageContextOptional } from "./page-context";

type BlockCollectionProps = {
  contents: BlockCollectionContentItem[];
  enableCommenting?: boolean;
  readonly: boolean;
  autoFocus?: boolean;
  ownedById: OwnedById;
  entityId: EntityId;
  sx?: BoxProps["sx"];
};

/**
 * The naming of this as a "Block" is… interesting, considering it doesn't
 * really work like a Block. It would be cool to somehow detach the process of
 * rendering child blocks from this and have a renderer, but it seems tricky to
 * do that
 */
export const BlockCollection: FunctionComponent<BlockCollectionProps> = ({
  contents,
  readonly,
  enableCommenting = false,
  autoFocus = true,
  ownedById,
  entityId,
  sx,
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

  const pageContext = usePageContextOptional();

  const { pageTitleRef, setEditorContext } = pageContext ?? {};

  const snackbarManager = useSnackbar();

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
    const { view, connection, manager } = createEditorView({
      autoFocus,
      client,
      getBlocksMap: () => currentBlocks.current,
      getLastSavedValue: () =>
        currentContents.current.map((contentItem) => contentItem.rightEntity),
      isCommentingEnabled: enableCommenting,
      ownedById,
      pageEntityId: entityId,
      pageTitleRef,
      readonly,
      renderNode: node,
      renderPortal,
      snackbarManager,
    });

    if (setEditorContext) {
      setEditorContext({ view, manager });
    }

    prosemirrorSetup.current = {
      view,
      connection: connection ?? null,
      manager,
    };

    return () => {
      clearPortals();
      try {
        view.destroy();
      } catch {
        /**
         * Sometimes the Quick Note page can result in docView being null when calling view.destroy()
         * Ideally we would figure out why we're calling view.destroy() when it's null, but this seems to fix it for now
         * @see https://discuss.prosemirror.net/t/what-could-create-a-null-docview/1830
         */
      }
      connection?.close();
      prosemirrorSetup.current = null;
    };
  }, [
    ownedById,
    currentBlocks,
    entityId,
    renderPortal,
    readonly,
    clearPortals,
    setEditorContext,
    pageTitleRef,
    client,
    enableCommenting,
    autoFocus,
    snackbarManager,
  ]);

  return (
    <>
      <Box
        id="root"
        ref={root}
        sx={[
          {
            ".ProseMirror": {
              width: "100%",
              paddingTop: 0,
            },
            // prevents blue outline on selected nodes
            ".ProseMirror-selectednode": { outline: "none" },
            ".suggester-placeholder-text::after": {
              content: "attr(placeholder)",
              color: ({ palette }) => palette.gray[60],
            },
            ".suggester-at-symbol": {
              color: ({ palette }) => palette.gray[40],
            },
            ".suggester": {
              "&:not(.suggester-placeholder-text):first-of-type": {
                borderRightWidth: 0,
                paddingRight: 0,
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
              },
              "&:not(.suggester-placeholder-text):last-of-type": {
                borderLeftWidth: 0,
                paddingLeft: 0,
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
              },
              background: ({ palette }) => palette.gray[10],
              borderStyle: "solid",
              borderWidth: 1,
              borderColor: ({ palette }) => palette.gray[20],
              borderTopLeftRadius: "8px",
              borderTopRightRadius: "8px",
              px: 1,
              paddingTop: 0.5,
              paddingBottom: 1,
            },
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
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
