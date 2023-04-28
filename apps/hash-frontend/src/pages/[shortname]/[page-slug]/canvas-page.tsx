import "@tldraw/tldraw/editor.css";
import "@tldraw/tldraw/ui.css";

import { BlockEntity } from "@local/hash-isomorphic-utils/entity";
import { AccountId, EntityId } from "@local/hash-subgraph";
import { Tldraw } from "@tldraw/tldraw";

import { BlocksMap } from "../../../blocks/page/create-editor-view";
import { PageThread } from "../../../components/hooks/use-page-comments";

type CanvasPageBlockProps = {
  contents: BlockEntity[];
  blocks: BlocksMap;
  pageComments: PageThread[];
  accountId: AccountId;
  entityId: EntityId;
};
export const CanvasPageBlock = ({ blocks, contents }: CanvasPageBlockProps) => {
  return (
    <div style={{ height: "100%" }}>
      <Tldraw />
    </div>
  );
};
