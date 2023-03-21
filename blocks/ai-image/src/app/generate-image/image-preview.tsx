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

import { ArrowUpIcon } from "../../icons/arrow-up";
import { Grid2PlusIcon } from "../../icons/grid-2-plus";
import { ImageIcon } from "../../icons/image";
import { RectangleHistoryCirclePlusIcon } from "../../icons/rectangle-history-circle-plus";
import { SquarePlusIcon } from "../../icons/square-plus";
import { ImageTile } from "../../shared/image-tile";
import { ImageObject } from "../generate-image";
import { ImageDetails } from "./image-preview/image-details";

const IMAGE_SIZE = 182;
const IMAGE_LIST_GAP = 30;

const ADDITIONAL_IMAGES_OPTIONS = [
  { number: 1, Icon: SquarePlusIcon },
  { number: 4, Icon: Grid2PlusIcon },
  { number: 9, Icon: RectangleHistoryCirclePlusIcon },
];

enum ANIMATION_STAGES {
  IMAGES_FADE_OUT = "imagesFadeOut",
  SELECTED_IMAGE_ZOOM_IN = "selectedImageZoomIn",
  DETAILS_FADE_IN = "detailsFadeIn",
  DETAILS_FADE_OUT = "detailsFadeOut",
  SELECTED_IMAGE_ZOOM_OUT = "selectedImageZoomOut",
}

export const ImagePreview = ({
  onConfirm,
  onDiscard,
  images,
  prompt,
  loading,
  errorMessage,
  generateAdditionalImages,
}: {
  onConfirm: (imageEntityId: string) => void;
  onDiscard: () => void;
  images: ImageObject[];
  prompt: string;
  loading: boolean;
  errorMessage: string;
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
  const [animationStage, setAnimationStage] = useState<
    false | ANIMATION_STAGES
  >(false);

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

  const shouldImagesFadeOut = selectedImageIndex !== null;
  const shouldSelectedImageZoomIn =
    shouldImagesFadeOut &&
    animationStage !== ANIMATION_STAGES.IMAGES_FADE_OUT &&
    animationStage !== ANIMATION_STAGES.SELECTED_IMAGE_ZOOM_OUT;
  const shouldDetailsFadeIn =
    shouldSelectedImageZoomIn &&
    animationStage !== ANIMATION_STAGES.SELECTED_IMAGE_ZOOM_IN &&
    animationStage !== ANIMATION_STAGES.DETAILS_FADE_OUT;

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

        <Collapse in={!!errorMessage}>
          <Typography
            sx={{
              color: ({ palette }) => palette.red[50],
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {errorMessage}
          </Typography>
        </Collapse>
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
                ...(selectedImageIndex !== null && shouldSelectedImageZoomIn
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
                    <Fade key={id} in={!shouldImagesFadeOut || selected}>
                      <Box
                        ref={(ref: HTMLDivElement | undefined) => {
                          if (selected && ref) {
                            setSelectedImageContainer(ref);
                          }
                        }}
                      >
                        <ImageListItem
                          onClick={() => {
                            if (!loading && selectedImageIndex === null) {
                              setAnimationStage(
                                ANIMATION_STAGES.IMAGES_FADE_OUT,
                              );
                              setSelectedImageIndex(index);
                            }
                          }}
                          sx={{
                            cursor:
                              !loading && selectedImageIndex === null
                                ? "pointer"
                                : "default",
                            transition: ({ transitions }) =>
                              transitions.create("transform"),
                            transformOrigin: "0 0",
                            ...(shouldSelectedImageZoomIn &&
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
                    in={!shouldImagesFadeOut}
                    onExited={() => {
                      setAnimationStage(
                        ANIMATION_STAGES.SELECTED_IMAGE_ZOOM_IN,
                      );

                      setTimeout(() => {
                        setAnimationStage(ANIMATION_STAGES.DETAILS_FADE_IN);
                      }, 500);
                    }}
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

            {!isMobile ? (
              <Fade
                in={shouldDetailsFadeIn}
                onEntered={() => setAnimationStage(false)}
                onExited={() => {
                  setAnimationStage(ANIMATION_STAGES.SELECTED_IMAGE_ZOOM_OUT);
                  setTimeout(() => {
                    setSelectedImageIndex(null);
                    setAnimationStage(false);
                  }, 500);
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-around",
                    flexDirection: "column",
                    width: (selectedImageTransition?.imageSize ?? 0) - 48,
                    height: 1,
                    position: "absolute",
                    top: 0,
                    right: 0,
                  }}
                >
                  <ImageDetails
                    generatedAt={selectedImageGeneratedAt}
                    isMobile={isMobile}
                    onSubmit={() => {
                      const selectedImageEntityId =
                        selectedImageIndex !== null &&
                        images[selectedImageIndex]?.entityId;

                      if (selectedImageEntityId) {
                        onConfirm(selectedImageEntityId);
                      }
                    }}
                    onCancel={() => {
                      setAnimationStage(ANIMATION_STAGES.DETAILS_FADE_OUT);
                    }}
                  />
                </Box>
              </Fade>
            ) : (
              <Collapse
                in={shouldDetailsFadeIn}
                onEntered={() => setAnimationStage(false)}
                onExited={() => {
                  setAnimationStage(ANIMATION_STAGES.SELECTED_IMAGE_ZOOM_OUT);
                  setTimeout(() => {
                    setSelectedImageIndex(null);
                    setAnimationStage(false);
                  }, 500);
                }}
              >
                <Box mt={2}>
                  <ImageDetails
                    generatedAt={selectedImageGeneratedAt}
                    isMobile={isMobile}
                    onSubmit={() => {
                      const selectedImageEntityId =
                        selectedImageIndex !== null &&
                        images[selectedImageIndex]?.entityId;

                      if (selectedImageEntityId) {
                        onConfirm(selectedImageEntityId);
                      }
                    }}
                    onCancel={() => {
                      setAnimationStage(ANIMATION_STAGES.DETAILS_FADE_OUT);
                    }}
                  />
                </Box>
              </Collapse>
            )}
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
              background: palette.gray[10],
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
