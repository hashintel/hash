import type { BlockComponent } from "@blockprotocol/graph/react";
import {
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import { useHook, useHookBlockModule } from "@blockprotocol/hook/react";
import { useRef } from "react";

import { EmojiIcon } from "./emoji-icon";
import { propertyIds } from "./property-ids";
import type { BlockEntity } from "./types/generated/block-entity";

export const App: BlockComponent<BlockEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const { rootEntity } = useEntitySubgraph(blockEntitySubgraph);
  const editableRef = useRef<HTMLDivElement>(null);
  const {
    [propertyIds.emoji]: icon,
    [propertyIds.textualContent]: textualContent,
  } = rootEntity.properties;
  const { entityId } = rootEntity.metadata.recordId;

  const blockRef = useRef<HTMLDivElement>(null);
  /* @ts-expect-error –– @todo H-3839 packages in BP repo needs updating, or this package updating to use graph in this repo */
  const { graphModule } = useGraphBlockModule(blockRef);
  /* @ts-expect-error –– @todo H-3839 packages in BP repo needs updating */
  const { hookModule } = useHookBlockModule(blockRef);

  useHook(
    hookModule,
    editableRef,
    "text",
    entityId,
    [propertyIds.textualContent],
    (node) => {
      // eslint-disable-next-line no-param-reassign
      node.innerText = typeof textualContent === "string" ? textualContent : "";

      return () => {
        // eslint-disable-next-line no-param-reassign
        node.innerText = "";
      };
    },
  );

  const handleIconChange = (newIcon: string | undefined): void => {
    if (!entityId) {
      return;
    }

    void graphModule.updateEntity({
      data: {
        entityId,
        entityTypeId: rootEntity.metadata.entityTypeId,
        properties: {
          ...rootEntity.properties,
          [propertyIds.emoji]: newIcon ?? null,
        },
      },
    });
  };

  if (readonly && !textualContent && !icon) {
    return null;
  }

  return (
    <div
      style={{
        borderRadius: "0.25em",
        width: "100%",
        position: "relative",
        padding: "0.5em",
        background: "#f9fafc",
        border: "1px solid #dee7f3",
      }}
      ref={blockRef}
    >
      <EmojiIcon
        disabled={readonly}
        onChange={handleIconChange}
        value={icon ?? "📢"}
      />
      <div
        style={{
          minHeight: "1.5em",
          paddingLeft: "1.5em",
        }}
        ref={editableRef}
      />
    </div>
  );
};
