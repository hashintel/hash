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
import { Grid2PlusIcon } from "../../icons/grid-2-plus";
import { ImageIcon } from "../../icons/image";
import { RectangleHistoryCirclePlusIcon } from "../../icons/rectangle-history-circle-plus";
import { SquareDashedCirclePlusIcon } from "../../icons/square-dashed-circle-plus";
import { SquarePlusIcon } from "../../icons/square-plus";
import { ImageTile } from "../../shared/image-tile";
import { ImageObject } from "../generate-image";

const IMAGE_SIZE = 182;
const IMAGE_LIST_GAP = 30;

const ADDITIONAL_IMAGES_OPTIONS = [
  { number: 1, Icon: SquarePlusIcon },
  { number: 4, Icon: Grid2PlusIcon },
  { number: 9, Icon: RectangleHistoryCirclePlusIcon },
];

export const ImagePreview = ({
  onConfirm,
  onDiscard,
  images,
  prompt,
  loading,
  generateAdditionalImages,
}: {
  onConfirm: (imageEntityId: string) => void;
  onDiscard: () => void;
  images: ImageObject[];
  prompt: string;
  loading: boolean;
  generateAdditionalImages: (numberOfImages: number) => void;
}) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(
    null,
  );
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
    if (selectedImageContainer && selectedImageIndex !== null) {
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
  }, [isMobile, selectedImageContainer, selectedImageIndex]);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      calculateCols();
      calculateSelectedImageTransition();
    });

    if (imageListContainerRef.current) {
      resizeObserver.observe(imageListContainerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [calculateSelectedImageTransition]);

  useEffect(() => {
    calculateSelectedImageTransition();
  }, [selectedImageIndex, calculateSelectedImageTransition]);

  const selectedImageGeneratedAt = useMemo(() => {
    const selectedImageDate =
      selectedImageIndex !== null && images[selectedImageIndex]?.date;
    if (selectedImageDate) {
      const date = new Date(selectedImageDate);
      return date.toString();
    }

    return "";
  }, [images, selectedImageIndex]);

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
          borderTopWidth: 0,
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10,
          overflow: "hidden",
        }}
      >
        <Box sx={{ paddingY: 2.75, paddingX: 3.75 }}>
          <Typography
            sx={{
              color: ({ palette }) => palette.gray[70],
              fontWeight: 700,
              fontSize: 13,
              lineHeight: 1.3,
              textTransform: "uppercase",
              mb: 1.25,
            }}
          >
            Outputs
            {selectedImageIndex !== null ? (
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
                    Math.ceil(
                      (images.length + ADDITIONAL_IMAGES_OPTIONS.length) /
                        imageListCols,
                    ) -
                  IMAGE_LIST_GAP,
                ...(selectedImageIndex !== null && !animatingImageOut
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
                  const id = "id" in image ? image.id : "";

                  const selected = selectedImageIndex === index;
                  return (
                    <Fade
                      key={id}
                      in={
                        (selectedImageIndex === null && !animatingImageOut) ||
                        selected
                      }
                    >
                      <Box
                        ref={(ref: HTMLDivElement | undefined) => {
                          if (selected && ref) {
                            setSelectedImageContainer(ref);
                          }
                        }}
                      >
                        <ImageListItem
                          onClick={() => {
                            if (!loading) {
                              setAnimatingImageIn(true);
                              setSelectedImageIndex(index);
                            }
                          }}
                          sx={{
                            cursor: loading ? "default" : "pointer",
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
                          <ImageTile
                            url={image.url}
                            description={`Option ${index + 1}`}
                            maxWidth={imageSize}
                            objectFit="cover"
                          />
                        </ImageListItem>
                      </Box>
                    </Fade>
                  );
                })}

                {ADDITIONAL_IMAGES_OPTIONS.map(({ number, Icon }) => (
                  <Fade
                    key={number}
                    in={selectedImageIndex === null && !animatingImageOut}
                    onExited={() => setAnimatingImageIn(false)}
                  >
                    <Button
                      variant="tertiary"
                      disabled={loading}
                      sx={({ palette }) => ({
                        display: "flex",
                        flexDirection: "column",
                        height: imageSize,
                        justifyContent: "center",
                        alignItems: "center",
                        fontSize: 15,
                        borderRadius: 0,
                        border: "none",
                        background: palette.gray[20],
                        color: palette.gray[60],
                        fill: palette.gray[50],
                        "&:hover": {
                          background: palette.gray[30],
                          color: palette.gray[70],
                          fill: palette.gray[60],
                        },
                      })}
                      onClick={() => generateAdditionalImages(number)}
                    >
                      <Icon sx={{ fontSize: 28, mb: 1.5 }} />
                      <Box>
                        Generate <strong>{number}</strong>
                      </Box>
                      <Box> more option{number > 1 ? "s" : ""}</Box>
                    </Button>
                  </Fade>
                ))}
              </ImageList>
            </Box>

            <Fade
              in={
                selectedImageIndex !== null &&
                !animatingImageIn &&
                !animatingInfoOut
              }
            >
              <Stack
                sx={{
                  justifyContent: "space-around",
                  transition: ({ transitions }) =>
                    transitions.create("max-height"),
                  maxHeight:
                    selectedImageIndex !== null && !animatingImageIn ? 9999 : 0,
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
                        const selectedImageEntityId =
                          selectedImageIndex !== null &&
                          images[selectedImageIndex]?.entityId;

                        if (selectedImageEntityId) {
                          onConfirm(selectedImageEntityId);
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
                          setSelectedImageIndex(null);
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
        </Box>

        <Collapse in={selectedImageIndex === null}>
          <Box
            sx={({ palette }) => ({
              boxSizing: "border-box",
              width: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              // border: `1px solid ${palette.gray[30]}`,
              background: palette.gray[10],
              // borderBottomLeftRadius: 10,
              // borderBottomRightRadius: 10,
              // borderTopWidth: 0,
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
                {loading
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
      </Stack>
    </Box>
  );
};
