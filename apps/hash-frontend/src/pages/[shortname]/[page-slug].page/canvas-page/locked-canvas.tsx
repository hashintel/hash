import { CanvasPosition } from "@local/hash-graphql-shared/graphql/types";
import { Matrix2d, toDomPrecision } from "@tldraw/primitives";

import { BlockContextProvider } from "../../../../blocks/page/block-context";
import { BlockLoader } from "../../../../components/block-loader/block-loader";
import { CanvasProps } from "./shared";

export const FixedCanvas = ({ blocks, contents }: CanvasProps) => {
  return (
    <div style={{ height: "100%", position: "relative" }}>
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

            // const metadata = blocks[blockEntity.componentId]?.meta;
            //
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
