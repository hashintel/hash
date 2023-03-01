import { ImageObject } from "../generate-image";
import { useState } from "react";
import { RemoteFileEntity } from "@blockprotocol/graph";

// @todo reuse repeated styles
export const ImagePreview = ({
  onConfirm,
  onDiscard,
  images,
  prompt,
  uploadInProgress,
}: {
  onConfirm: (imageEntity: RemoteFileEntity) => void;
  onDiscard: () => void;
  images: RemoteFileEntity[] | ImageObject[];
  prompt: string;
  uploadInProgress: boolean;
}) => {
  const [selectedImageEntity, setSelectedImageEntity] =
    useState<RemoteFileEntity | null>(null);

  console.log({ images, uploadInProgress });

  return (
    <div
      style={{
        border: "1px solid rgba(122, 202, 250, 1)",
        borderRadius: 10,
        marginTop: 30,
      }}
    >
      <div
        style={{
          background: "#E0F4FF",
          borderRadius: "10px 10px 0 0",
          padding: "20px 35px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 18,
                color: "rgba(55, 67, 79, 1)",
                fontWeight: 500,
              }}
            >
              GENERATED IMAGES
            </div>
            <div style={{ fontSize: 16, color: "rgba(117, 138, 161, 1)" }}>
              {uploadInProgress
                ? "Uploading, please wait..."
                : "Click an image to preview or accept"}
            </div>
          </div>

          <div>
            <button
              onClick={onDiscard}
              style={{
                background: "white",
                border: "1px solid rgba(221, 231, 240, 1)",
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: "colfax-web",
                fontSize: 14,
                padding: "12px 16px",
              }}
            >
              Try another prompt
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "20px 35px",
        }}
      >
        {selectedImageEntity ? (
          <>
            <div style={{ width: "50%", marginRight: 40 }}>
              <img
                alt={
                  selectedImageEntity.properties[
                    "https://blockprotocol.org/@blockprotocol/types/property-type/description/"
                  ]
                }
                src={
                  selectedImageEntity.properties[
                    "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
                  ]
                }
                style={{ objectFit: "contain", width: "100%", height: "auto" }}
              />
            </div>
            <div
              style={{
                width: "50%",
                color: "rgba(117, 138, 161, 1)",
                fontSize: 14,
              }}
            >
              <div style={{ color: "rgba(7, 117, 227, 1)", fontSize: 24 }}>
                Option{" "}
                {(images as RemoteFileEntity[]).findIndex(
                  (value) =>
                    value.metadata.recordId.entityId ===
                    selectedImageEntity?.metadata.recordId.entityId,
                ) + 1}
              </div>
              <div style={{ marginTop: 20 }}>
                <div style={{ fontWeight: 500 }}>IMAGE DIMENSIONS</div>
                <div>1024 pixels (width)</div>
                <div>1024 pixels (height)</div>
              </div>
              <div style={{ marginTop: 20 }}>
                <div style={{ fontWeight: 500 }}>AI MODEL</div>
                <div>OpenAI DALL-E</div>
              </div>
              <div style={{ marginTop: 20 }}>
                <div style={{ fontWeight: 500 }}>PROMPT PROVIDED</div>
                <div>{prompt}</div>
              </div>
              <div style={{ display: "flex", marginTop: 20 }}>
                <button
                  onClick={() => onConfirm(selectedImageEntity)}
                  style={{
                    border: "1px solid rgba(221, 231, 240, 1)",
                    borderRadius: 4,
                    background: "rgba(7, 117, 227, 1)",
                    color: "white",
                    cursor: "pointer",
                    fontFamily: "colfax-web",
                    fontSize: 14,
                    fontWeight: 500,
                    marginRight: 15,
                    padding: "12px 16px",
                  }}
                >
                  Choose this image
                </button>
                <button
                  onClick={() => setSelectedImageEntity(null)}
                  style={{
                    background: "white",
                    border: "1px solid rgba(221, 231, 240, 1)",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontFamily: "colfax-web",
                    fontSize: 14,
                    padding: "12px 16px",
                  }}
                >
                  Go back
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {images.map((image) => {
              const src =
                "url" in image
                  ? image.url
                  : image.properties[
                      "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
                    ];
              return (
                <button
                  disabled={uploadInProgress}
                  onClick={() =>
                    setSelectedImageEntity(image as RemoteFileEntity)
                  }
                  key={src}
                  style={{
                    width: "24.5%",
                    background: "none",
                    border: "none",
                    cursor: uploadInProgress ? "default" : "pointer",
                    padding: 0,
                  }}
                >
                  <img
                    src={src}
                    style={{
                      objectFit: "contain",
                      width: "100%",
                      height: "auto",
                    }}
                  />
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
