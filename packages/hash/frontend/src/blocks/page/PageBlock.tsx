import { ProsemirrorManager } from "@hashintel/hash-shared/ProsemirrorManager";
import { useRouter } from "next/router";
import { Schema } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import { useLayoutEffect, useRef, FunctionComponent } from "react";
import { useLocalstorageState } from "rooks";

import { Button } from "@hashintel/hash-design-system";
import { BlockLoadedProvider } from "../onBlockLoaded";
import { UserBlocksProvider } from "../userBlocks";
import { EditorConnection } from "./collab/EditorConnection";
import { BlocksMap, createEditorView } from "./createEditorView";
import { usePortals } from "./usePortals";

type PageBlockProps = {
  blocks: BlocksMap;
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
  blocks,
  accountId,
  entityId,
}) => {
  const root = useRef<HTMLDivElement>(null);
  const [portals, renderPortal] = usePortals();
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
    );

    prosemirrorSetup.current = {
      view,
      connection: connection ?? null,
      manager,
    };

    return () => {
      // @todo how does this work with portals?
      node.innerHTML = "";
      prosemirrorSetup.current = null;
      connection?.close();
    };
  }, [accountId, blocks, entityId, renderPortal]);

  return (
    <UserBlocksProvider value={blocks}>
      <BlockLoadedProvider routeHash={routeHash}>
        <div id="root" ref={root} />
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
