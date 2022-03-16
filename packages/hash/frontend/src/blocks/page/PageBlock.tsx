import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { Schema } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import React, { useLayoutEffect, useRef, VoidFunctionComponent } from "react";
import { useLocalstorageState } from "rooks";

import { Button } from "../../components/Button";
import { BlocksMetaMap, BlocksMetaProvider } from "../blocksMeta";
import { UserBlock, UserBlocksProvider } from "../userBlocks";
import { EditorConnection } from "./collab/EditorConnection";
import { createEditorView } from "./createEditorView";
import { usePortals } from "./usePortals";

type PageBlockProps = {
  blocksMeta: BlocksMetaMap;
  initialUserBlocks: UserBlock[];
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
    <BlocksMetaProvider value={blocksMeta}>
      <UserBlocksProvider value={initialUserBlocks}>
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
      </UserBlocksProvider>
    </BlocksMetaProvider>
  );
};
