import { CanvasPosition } from "@local/hash-graphql-shared/graphql/types";
import { Matrix2d, toDomPrecision } from "@tldraw/primitives";

import { BlockLoader } from "../../../../components/block-loader/block-loader";
import { BlockContextProvider } from "../../../shared/block-collection/block-context";
import { CanvasProps } from "./shared";

/**
 * Display blocks at a given x/y position, with width, height and rotation, with no ability to edit position.
 *
 * Known issues to be fixed when we develop the ability to build apps further:
 * – if the TLDraw canvas was panned, blocks will appear in a different position here.
 *   we probably will have a constrained editing canvas space that eliminates this issue
 * - rotated blocks can have click/tap targets which are inconsistent with their visual appearance
 */
export const LockedCanvas = ({ blocks, contents }: CanvasProps) => {
  return (
    <div style={{ height: "100%", position: "relative" }}>
      {/* These wrapping divs mimic TLDraw's to keep visual consistency between locked/non-locked mode */}
      <div
        style={{
          position: "relative",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "rgb(249, 250, 251)",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          {contents.map(({ linkEntity, rightEntity: blockEntity }) => {
            const {
              "https://blockprotocol.org/@hash/types/property-type/x-position/":
                x,
              "https://blockprotocol.org/@hash/types/property-type/y-position/":
                y,
              "https://blockprotocol.org/@hash/types/property-type/width-in-pixels/":
                width,
              "https://blockprotocol.org/@hash/types/property-type/height-in-pixels/":
                height,
              "https://blockprotocol.org/@hash/types/property-type/rotation-in-rads/":
                rotation,
            } = linkEntity.properties as CanvasPosition;

            const matrix = Matrix2d.Compose(
              Matrix2d.Translate(x, y),
              Matrix2d.Rotate(rotation),
            );

            const blockLoaderProps = {
              blockEntityId:
                blockEntity.blockChildEntity.metadata.recordId.entityId,
              blockEntityTypeId:
                blockEntity.blockChildEntity.metadata.entityTypeId,
              wrappingEntityId: blockEntity.metadata.recordId.entityId,
              blockMetadata: blocks[blockEntity.componentId]!.meta,
              readonly: false,
            };

            return (
              <div
                key={linkEntity.metadata.recordId.entityId}
                style={{
                  width,
                  height,
                  transform: `matrix(${toDomPrecision(
                    matrix.a,
                  )}, ${toDomPrecision(matrix.b)}, ${toDomPrecision(
                    matrix.c,
                  )}, ${toDomPrecision(matrix.d)}, ${toDomPrecision(
                    matrix.e,
                  )}, ${toDomPrecision(matrix.f)})`,
                  transformOrigin: "top left",
                  position: "absolute",
                }}
              >
                <BlockContextProvider key={blockLoaderProps.wrappingEntityId}>
                  <BlockLoader
                    {...blockLoaderProps}
                    editableRef={null}
                    onBlockLoaded={() => null}
                  />
                </BlockContextProvider>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
