import {
  BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import { useHook, useHookBlockModule } from "@blockprotocol/hook/react";
import { useRef } from "react";

import { EmojiIcon } from "./emoji-icon";
import { propertyIds } from "./property-ids";
import { RootEntity } from "./types";

export const App: BlockComponent<RootEntity> = ({
  graph: { blockEntitySubgraph },
}) => {
  const { rootEntity } = useEntitySubgraph(blockEntitySubgraph);
  const editableRef = useRef<HTMLDivElement>(null);
  const { [propertyIds.emoji]: icon = "📢", [propertyIds.text]: text } =
    rootEntity.properties;
  const { entityId } = rootEntity.metadata.recordId;

  const blockRef = useRef<HTMLDivElement>(null);
  const { graphModule } = useGraphBlockModule(blockRef);
  const { hookModule } = useHookBlockModule(blockRef);

  useHook(
    hookModule,
    editableRef,
    "text",
    entityId,
    [propertyIds.text],
    (node) => {
      // eslint-disable-next-line no-param-reassign
      node.innerText = text ?? "";

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
        // @todo is this right? how do i detect if its been created yet?
        disabled={!entityId}
        onChange={handleIconChange}
        value={icon}
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
