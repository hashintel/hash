import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { useRouter } from "next/router";
import { Schema } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import React, { useLayoutEffect, useRef, VoidFunctionComponent } from "react";
import { useLocalstorageState } from "rooks";

import { Button } from "../../shared/ui";
import { BlockLoadedProvider } from "../onBlockLoaded";
import { RemoteBlockMetadata, UserBlocksProvider } from "../userBlocks";
import { EditorConnection } from "./collab/EditorConnection";
import { BlocksMetaMap, createEditorView } from "./createEditorView";
import { usePortals } from "./usePortals";

type PageBlockProps = {
  blocksMeta: BlocksMetaMap;
  initialUserBlocks: RemoteBlockMetadata[];
  accountId: string;
  entityId: string;
};

/**
 * The naming of this as a "Block" is… interesting, considering it doesn't
 * really work like a Block. It would be cool to somehow detach the process of
 * rendering child blocks from this and have a renderer, but it seems tricky to
 * do that
 */
export const PageBlock: VoidFunctionComponent<PageBlockProps> = ({
  // @todo consolidate blocksMeta and initialUserBlocks as they share properties
  // @see - https://app.asana.com/0/1200211978612931/1202023490862451/f
  blocksMeta,
  initialUserBlocks,
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
    manager: ProsemirrorSchemaManager;
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
      blocksMeta,
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
  }, [accountId, blocksMeta, entityId, renderPortal]);

  return (
    <UserBlocksProvider value={initialUserBlocks}>
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
