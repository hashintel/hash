import { BlockProtocolFunctions, BlockProtocolProps } from "blockprotocol";
import React, { useEffect, useRef, useState } from "react";

import { HtmlBlock } from "../HtmlBlock/HtmlBlock";
import { useRemoteBlock } from "./useRemoteBlock";
import { EmbedderGraphHandler } from "../../services/embedder-graph";
import { linkedEntities } from "@hashintel/hash-api/src/graphql/resolvers/entity/linkedEntities";

type RemoteBlockProps = {
  blockFunctions: BlockProtocolFunctions;
  blockProperties: Omit<BlockProtocolProps, keyof BlockProtocolFunctions>;
  crossFrame?: boolean;
  editableRef?: unknown;
  onBlockLoaded?: () => void;
  sourceUrl: string;
};

export const BlockLoadingIndicator: React.VFC = () => <div>Loading...</div>;

/**
 * @see https://github.com/Paciolan/remote-component/blob/2b2cfbb5b6006117c56f3aa7daa2292d3823bb83/src/createRemoteComponent.tsx
 */
export const RemoteBlock: React.VFC<RemoteBlockProps> = ({
  blockFunctions,
  blockProperties,
  crossFrame,
  editableRef,
  sourceUrl,
  onBlockLoaded,
}) => {
  const [loading, err, Component] = useRemoteBlock(
    sourceUrl,
    crossFrame,
    onBlockLoaded,
  );

  const [graphService, setGraphService] = useState<EmbedderGraphHandler>();

  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (Component && wrapperRef.current) {
      setGraphService(
        new EmbedderGraphHandler({
          callbacks: {
            updateEntity: async ({ payload }) => {
              try {
                const responsePayload = await blockFunctions.updateEntities?.([
                  payload!,
                ]);
                if (!responsePayload) {
                  throw new Error(
                    "No response from embedder updateEntities call",
                  );
                }
                return { payload: responsePayload[0]! };
              } catch (error) {
                return {
                  errors: [
                    { message: (error as Error).message, code: "ERROR" },
                  ],
                };
              }
            },
          },
          element: wrapperRef.current,
        }),
      );
    }
  }, [blockFunctions, Component]);

  // Not necessary here since we're providing the properties synchronously,
  // but this is how you'd update values when dealing with self-contained blocks
  useEffect(() => {
    if (graphService) {
      graphService.linkedEntities = blockProperties.linkedEntities;
    }
  }, [blockProperties.linkedEntities, graphService]);

  if (loading) {
    return <BlockLoadingIndicator />;
  }

  if (!Component) {
    throw new Error("Could not load and parse block from URL");
  }

  if (err) {
    throw err;
  }

  if (typeof Component === "string") {
    /**
     * This HTML block has no props available to it, unless loaded via FramedBlock.
     * @todo do something about this. throw if not in an iframe?
     *    or check for iframe status and assign props to window here, not FramedBlock?
     */
    return (
      <HtmlBlock
        html={Component}
        blockFunctions={blockFunctions}
        blockProperties={blockProperties}
      />
    );
  }

  return (
    <div ref={wrapperRef}>
      <Component {...blockProperties} editableRef={editableRef} />
    </div>
  );
};
