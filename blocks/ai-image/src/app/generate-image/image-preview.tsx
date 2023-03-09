import { RemoteFileEntity } from "@blockprotocol/graph";
import { Button } from "@hashintel/design-system";
import {
  Box,
  Collapse,
  Fade,
  ImageList,
  ImageListItem,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArrowLeftIcon } from "../../icons/arrow-left";
import { ArrowUpIcon } from "../../icons/arrow-up";
import { ImageIcon } from "../../icons/image";
import { SquareDashedCirclePlusIcon } from "../../icons/square-dashed-circle-plus";
import { ImageObject } from "../generate-image";

// const fileUrlKey =
//   "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/";

const IMAGE_SIZE = 182;
const IMAGE_LIST_GAP = 30;

// const getImageDimensionsAndSize = async (url: string) => {
//   const response = await fetch(url);
//   const contentLength = response.headers.get("content-length");
//   const img = new Image();
//   img.src = url;
//   await img.decode();

//   const size = parseInt(contentLength ?? "0", 10);
//   const unitSize = size >= 1048576 ? 1048576 : 1024;
//   const unitName = size >= 1048576 ? "MB" : "KB";
//   const sizeString = `${Math.floor(size / unitSize)}${unitName}`;
//   return {
//     width: img.naturalWidth,
//     height: img.naturalHeight,
//     size: sizeString,
//   };
// };

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
  // const [selectedImageMetadata, setSelectedImageMetadata] = useState<{
  //   size: string;
  //   width: number;
  //   height: number;
  // } | null>(null);
  const [imageListCols, setImageListCols] = useState(0);
  const [imageSize, setImageSize] = useState(0);

  const imageListContainerRef = useRef<HTMLUListElement | null>(null);
  const [selectedImageTransition, setSelectedImageTransition] = useState<{
    scale: number;
    translate: [number, number];
    imageSize: number;
  } | null>(null);
  const [selectedImageContainer, setSelectedImageContainer] =
    useState<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [animatingImageIn, setAnimatingImageIn] = useState(false);
  const [animatingImageOut, setAnimatingImageOut] = useState(false);
  const [animatingInfoOut, setAnimatingInfoOut] = useState(false);

  const calculateCols = () => {
    const containerWidth = imageListContainerRef.current?.offsetWidth;

    if (containerWidth) {
      setIsMobile(containerWidth < 700);
      const cols = Math.floor(
        (containerWidth + IMAGE_LIST_GAP) / (IMAGE_SIZE + IMAGE_LIST_GAP),
      );
      setImageListCols(cols);
      setImageSize((containerWidth + IMAGE_LIST_GAP) / cols - IMAGE_LIST_GAP);
    }
  };

  const calculateSelectedImageTransition = useCallback(() => {
    if (selectedImageContainer && selectedImageEntity) {
      const parentRect = (
        selectedImageContainer.parentNode?.parentNode as HTMLDivElement
      ).getBoundingClientRect();
      const childRect = selectedImageContainer.getBoundingClientRect();
      const offsetLeft = childRect.left - parentRect.left;
      const offsetTop = childRect.top - parentRect.top;

      const scale = parentRect.width / (isMobile ? 1 : 2) / childRect.width;

      setSelectedImageTransition({
        scale,
        translate: [-offsetLeft, -offsetTop],
        imageSize: childRect.width * scale,
      });
    } else {
      setSelectedImageTransition({
        scale: 1,
        translate: [0, 0],
        imageSize: 0,
      });
    }
  }, [isMobile, selectedImageContainer, selectedImageEntity]);

  useEffect(() => {
    const resizeListener = () => {
      calculateCols();
      calculateSelectedImageTransition();
    };

    resizeListener();
    window.addEventListener("resize", resizeListener);

    return () => window.removeEventListener("resize", resizeListener);
  }, [calculateSelectedImageTransition]);

  const selectedImageIndex = useMemo(
    () =>
      selectedImageEntity
        ? (images as RemoteFileEntity[]).findIndex(
            (value) =>
              value.metadata.recordId.entityId ===
              selectedImageEntity.metadata.recordId.entityId,
          )
        : -1,
    [selectedImageEntity, images],
  );

  useEffect(() => {
    // const url = selectedImageEntity?.properties[fileUrlKey];

    // if (url) {
    //   void getImageDimensionsAndSize(url).then((imageMetadata) => {
    //     setSelectedImageMetadata(imageMetadata);
    //   });
    // } else {
    //   setSelectedImageMetadata(null);
    // }

    calculateSelectedImageTransition();
  }, [selectedImageEntity, calculateSelectedImageTransition]);

  const selectedImageGeneratedAt = useMemo(() => {
    if (selectedImageEntity) {
      const date = new Date(selectedImageEntity.metadata.recordId.editionId);
      return date.toString();
    }

    return "";
  }, [selectedImageEntity]);

  return (
    <Box>
      <Stack
        sx={({ palette }) => ({
          border: `1px solid ${palette.gray[20]}`,
          background: palette.gray[10],
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
          paddingY: 2.125,
          paddingX: 3.75,
          gap: 0.75,
        })}
      >
        <Typography
          sx={{
            color: ({ palette }) => palette.gray[70],
            fontWeight: 700,
            fontSize: 13,
            lineHeight: 1.3,
            textTransform: "uppercase",
          }}
        >
          Prompt
        </Typography>

        <Stack flexDirection="row" gap={1.5} alignItems="center">
          <ImageIcon
            sx={{ fontSize: 16, color: ({ palette }) => palette.gray[40] }}
          />
          <Typography
            sx={{
              color: ({ palette }) => palette.black,
              fontSize: 16,
              lineHeight: 1.3,
            }}
          >
            {prompt}
          </Typography>
        </Stack>
      </Stack>

      <Stack
        gap={1.25}
        sx={{
          boxSizing: "border-box",
          width: 1,
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          border: ({ palette }) => `1px solid ${palette.gray[30]}`,
          paddingY: 2.75,
          paddingX: 3.75,
          borderTopWidth: 0,
          transition: ({ transitions }) =>
            transitions.create([
              "border-bottom-width",
              "border-bottom-left-radius",
              "border-bottom-right-radius",
            ]),
          ...(!selectedImageEntity
            ? { borderBottomWidth: 0 }
            : { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }),
        }}
      >
        <Typography
          sx={{
            color: ({ palette }) => palette.gray[70],
            fontWeight: 700,
            fontSize: 13,
            lineHeight: 1.3,
            textTransform: "uppercase",
          }}
        >
          Outputs
          {selectedImageEntity ? (
            <>
              {" > "}
              <Box component="span" sx={{ fontWeight: 400 }}>
                Option {selectedImageIndex + 1}
              </Box>
            </>
          ) : null}
        </Typography>

        <Box position="relative">
          <Box
            sx={{
              transition: ({ transitions }) => transitions.create("height"),
              height:
                (imageSize + IMAGE_LIST_GAP) *
                  Math.ceil(images.length / imageListCols) -
                IMAGE_LIST_GAP,
              ...(selectedImageEntity && !animatingImageOut
                ? {
                    height: selectedImageTransition?.imageSize,
                  }
                : {}),
            }}
          >
            <ImageList
              cols={imageListCols}
              gap={IMAGE_LIST_GAP}
              sx={{
                width: 1,
                margin: 0,
                overflow: "visible",
              }}
              ref={imageListContainerRef}
            >
              {images.map((image, index) => {
                const src =
                  "url" in image
                    ? image.url
                    : image.properties[
                        "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
                      ];

                const selectedImage = selectedImageIndex === index;
                return (
                  <Fade
                    key={src}
                    in={
                      (!selectedImageEntity && !animatingImageOut) ||
                      selectedImage
                    }
                    onExited={() => setAnimatingImageIn(false)}
                  >
                    <Box
                      ref={(ref: HTMLDivElement | undefined) => {
                        if (selectedImage && ref) {
                          setSelectedImageContainer(ref);
                        }
                      }}
                    >
                      <ImageListItem
                        onClick={() => {
                          if (!uploadInProgress) {
                            setAnimatingImageIn(true);
                            setSelectedImageEntity(image as RemoteFileEntity);
                          }
                        }}
                        sx={{
                          cursor: uploadInProgress ? "default" : "pointer",
                          transition: ({ transitions }) =>
                            transitions.create("transform"),
                          transformOrigin: "0 0",
                          ...(!animatingImageIn &&
                          !animatingImageOut &&
                          selectedImageTransition
                            ? {
                                transform: `translate(${selectedImageTransition.translate[0]}px, ${selectedImageTransition.translate[1]}px) scale(${selectedImageTransition.scale})`,
                              }
                            : {}),
                        }}
                      >
                        <img
                          src={src}
                          loading="lazy"
                          alt={`Option ${index + 1}`}
                        />
                      </ImageListItem>
                    </Box>
                  </Fade>
                );
              })}
            </ImageList>
          </Box>

          <Fade
            in={!!selectedImageEntity && !animatingImageIn && !animatingInfoOut}
          >
            <Stack
              sx={{
                justifyContent: "space-around",
                transition: ({ transitions }) =>
                  transitions.create("max-height"),
                maxHeight: selectedImageEntity && !animatingImageIn ? 9999 : 0,
                ...(!isMobile
                  ? {
                      width: (selectedImageTransition?.imageSize ?? 0) - 48,
                      height: selectedImageTransition?.imageSize,
                      position: "absolute",
                      top: 0,
                      right: 0,
                    }
                  : { mt: 2 }),
              }}
              gap={isMobile ? 6 : 9.75}
            >
              <Stack gap={3}>
                {/* <Stack gap={0.75}>
                  <Typography
                    sx={{
                      color: ({ palette }) => palette.gray[60],
                      fontWeight: 700,
                      fontSize: 13,
                      lineHeight: 1.3,
                      textTransform: "uppercase",
                    }}
                  >
                    File Size
                  </Typography>

                  {selectedImageMetadata ? (
                    <Typography
                      sx={{
                        color: ({ palette }) => palette.gray[60],
                        fontSize: 16,
                        lineHeight: 1.2,
                      }}
                    >
                      {selectedImageMetadata.size}
                    </Typography>
                  ) : (
                    <Skeleton height={19} />
                  )}
                </Stack> */}

                <Stack gap={0.75}>
                  <Typography
                    sx={{
                      color: ({ palette }) => palette.gray[60],
                      fontWeight: 700,
                      fontSize: 13,
                      lineHeight: 1.3,
                      textTransform: "uppercase",
                    }}
                  >
                    Image Dimensions
                  </Typography>

                  <Typography
                    sx={{
                      color: ({ palette }) => palette.gray[60],
                      fontSize: 16,
                      lineHeight: 1.2,
                    }}
                  >
                    1024 x 1024 pixels
                  </Typography>

                  {/* {selectedImageMetadata ? (
                    <Typography
                      sx={{
                        color: ({ palette }) => palette.gray[60],
                        fontSize: 16,
                        lineHeight: 1.2,
                      }}
                    >
                      {selectedImageMetadata.width} x{" "}
                      {selectedImageMetadata.height} pixels
                    </Typography>
                  ) : (
                    <Skeleton height={19} />
                  )} */}
                </Stack>

                <Stack gap={0.75}>
                  <Typography
                    sx={{
                      color: ({ palette }) => palette.gray[60],
                      fontWeight: 700,
                      fontSize: 13,
                      lineHeight: 1.3,
                      textTransform: "uppercase",
                    }}
                  >
                    Generated At
                  </Typography>

                  <Typography
                    sx={{
                      color: ({ palette }) => palette.gray[60],
                      fontSize: 16,
                      lineHeight: 1.2,
                    }}
                  >
                    {selectedImageGeneratedAt}
                  </Typography>
                </Stack>

                <Box mt={1.5}>
                  <Button
                    size="small"
                    onClick={() => {
                      if (selectedImageEntity) {
                        onConfirm(selectedImageEntity);
                      }
                    }}
                    sx={{
                      gap: 1,
                      borderRadius: 1,
                      fontSize: 14,
                      fontWeight: 500,
                      lineHeight: "18px",
                    }}
                  >
                    Insert this image
                    <SquareDashedCirclePlusIcon
                      sx={{
                        fontSize: 16,
                      }}
                    />
                  </Button>
                </Box>
              </Stack>

              <Box>
                <Button
                  variant="tertiary"
                  size="small"
                  onClick={() => {
                    setAnimatingInfoOut(true);
                    setTimeout(() => {
                      setAnimatingImageOut(true);

                      setTimeout(() => {
                        setSelectedImageEntity(null);
                        setAnimatingImageOut(false);
                        setAnimatingInfoOut(false);
                      }, 500);
                    }, 300);
                  }}
                  sx={({ palette }) => ({
                    gap: 1,
                    borderRadius: 1,
                    fontSize: 14,
                    fontWeight: 500,
                    lineHeight: "18px",
                    color: palette.gray[70],
                    fill: palette.gray[50],

                    ":hover": {
                      fill: palette.gray[80],
                    },
                  })}
                >
                  <ArrowLeftIcon
                    sx={{
                      fontSize: 16,
                      fill: "inherit",
                    }}
                  />
                  Return to options
                </Button>
              </Box>
            </Stack>
          </Fade>
        </Box>
      </Stack>

      <Collapse in={!selectedImageEntity}>
        <Box
          sx={({ palette }) => ({
            boxSizing: "border-box",
            width: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            border: `1px solid ${palette.gray[30]}`,
            background: palette.gray[10],
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 10,
            borderTopWidth: 0,
            paddingY: 2.125,
            paddingX: 3.75,
          })}
        >
          <Box display="flex" gap={1}>
            <ArrowUpIcon
              sx={{ fontSize: 16, color: ({ palette }) => palette.gray[40] }}
            />
            <Typography
              sx={{
                color: ({ palette }) => palette.gray[80],
                fontSize: 14,
                lineHeight: "18px",
                fontWeight: 500,
              }}
            >
              {uploadInProgress
                ? "Uploading images..."
                : "Click an image to preview or insert it"}
            </Typography>
          </Box>

          <Button
            variant="tertiary"
            size="small"
            onClick={onDiscard}
            sx={{ fontSize: 14 }}
          >
            Try another prompt
          </Button>
        </Box>
      </Collapse>
    </Box>
  );
};
