import { faCopy, faPenToSquare } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowRotateLeft,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import {
  Box,
  Button,
  Card,
  CircularProgress,
  Fade,
  Link,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EditableField } from "./editable-field";
import { AppleIcon } from "./icons/apple-icon";
import { GoogleIcon } from "./icons/google-icon";
import { MapButton } from "./map-button";

type AddressCardProps = {
  title?: string;
  description?: string;
  fullAddress?: string;
  mapUrl?: string;
  hovered: boolean;
  readonly?: boolean;
  onClose: () => void;
  updateTitle: (title: string) => void;
  updateDescription: (description: string) => void;
  incrementZoomLevel?: () => void;
  decrementZoomLevel?: () => void;
};

export const AddressCard = ({
  title,
  fullAddress,
  description,
  mapUrl,
  hovered,
  readonly,
  onClose,
  updateTitle,
  updateDescription,
  incrementZoomLevel,
  decrementZoomLevel,
}: AddressCardProps) => {
  const theme = useTheme();
  const [editingDescription, setEditingDescription] = useState(false);
  const [titleValue, setTitleValue] = useState(title);
  const [descriptionValue, setDescriptionValue] = useState(description);

  useEffect(() => {
    if (title !== titleValue) {
      setTitleValue(title);
    }
  }, [title]);

  useEffect(() => {
    if (description !== descriptionValue) {
      setDescriptionValue(description);
    }
  }, [description]);

  const [googleMapsUrl, appleMapsUrl] = useMemo(
    () =>
      fullAddress
        ? [
            `https://www.google.com/maps?q=${encodeURI(fullAddress)}`,
            `http://maps.apple.com/?q=${encodeURI(fullAddress)}`,
          ]
        : ["", ""],
    [fullAddress],
  );

  const copyToClipboard = useCallback(() => {
    if (fullAddress) {
      navigator.clipboard.writeText(fullAddress);
    }
  }, [fullAddress]);

  return (
    <Card
      sx={{
        display: "flex",
        width: "min-content",
        border: ({ palette }) => `1px solid ${palette.gray[20]}`,
        borderRadius: 2.5,
        boxShadow: "none",
        ".isMobile &": {
          flexDirection: "column",
          width: 1,
        },
      }}
    >
      <Stack
        sx={{
          boxSizing: "border-box",
          display: "flex",
          justifyContent: "space-between",
          paddingY: 3,
          paddingX: 3.75,
          gap: 4,
          width: 300,
          ".isMobile &": {
            width: 1,
          },
        }}
      >
        <Stack gap={1.5}>
          <EditableField
            value={titleValue}
            onChange={(event) => setTitleValue(event.target.value)}
            onBlur={(event) => updateTitle(event.target.value)}
            iconSize="21px"
            inputProps={{
              sx: {
                fontWeight: 700,
                fontSize: 21,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                color: theme.palette.common.black,
              },
            }}
            readonly={readonly}
          />

          <Box display="flex" gap={1} alignItems="center">
            {fullAddress ? (
              <Typography
                variant="regularTextLabels"
                sx={{
                  fontWeight: 500,
                  lineHeight: 1.3,
                  letterSpacing: "-0.02em",
                  color: ({ palette }) => palette.gray[90],
                }}
              >
                {fullAddress}
              </Typography>
            ) : null}
            {readonly ? (
              <Button
                onClick={copyToClipboard}
                variant="tertiary"
                sx={{
                  display: "inline-flex",
                  alignItems: "flex-start",
                  height: "fit-content",
                  borderRadius: "50%",
                  minWidth: "unset",
                  minHeight: "unset",
                  padding: 1,
                }}
              >
                <FontAwesomeIcon icon={faCopy} sx={{ fontSize: 12 }} />
              </Button>
            ) : null}
          </Box>
        </Stack>

        <Stack gap={1.5}>
          {googleMapsUrl ? (
            <MapButton href={googleMapsUrl}>
              <GoogleIcon sx={{ fontSize: 18, mr: 1 }} />
              Open in Google Maps
            </MapButton>
          ) : null}
          {appleMapsUrl ? (
            <MapButton href={appleMapsUrl}>
              <AppleIcon sx={{ fontSize: 18, mr: 1 }} />
              Open in Apple Maps
            </MapButton>
          ) : null}
        </Stack>

        {description || editingDescription ? (
          <EditableField
            value={descriptionValue}
            onChange={(event) => setDescriptionValue(event.target.value)}
            onBlur={(event) => {
              setEditingDescription(false);
              updateDescription(event.target.value);
            }}
            placeholder="Enter description"
            iconSize="14px"
            inputProps={{
              sx: {
                fontWeight: 500,
                fontSize: 14,
                lineHeight: 1.3,
                letterSpacing: "-0.02em",
                color: theme.palette.gray[90],
              },
            }}
            readonly={readonly}
          />
        ) : !readonly ? (
          <Typography
            onClick={() => {
              setEditingDescription(true);
            }}
            sx={{
              display: "flex",
              fontWeight: 500,
              fontSize: 14,
              lineHeight: 1.3,
              letterSpacing: "-0.02em",
              color: theme.palette.gray[50],
            }}
          >
            Click here to add a description or more detailed information
            <FontAwesomeIcon icon={faPenToSquare} sx={{ ml: 1 }} />
          </Typography>
        ) : null}
      </Stack>

      <Box
        sx={({ palette }) => ({
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          background: palette.gray[10],
          borderLeft: `1px solid ${palette.gray[20]}`,
          width: 500,
          minHeight: 300,

          ".isMobile &": {
            width: 1,
            height: 300,
          },
        })}
      >
        {mapUrl ? (
          <Box
            sx={{
              width: 1,
              height: 1,
              background: `url(${mapUrl}) no-repeat`,
              backgroundSize: "cover",
            }}
          >
            {!readonly ? (
              <Fade in={hovered}>
                <Stack
                  sx={{
                    display: "inline-flex",
                    position: "absolute",
                    top: 13,
                    left: 13,
                  }}
                >
                  <Button
                    onClick={incrementZoomLevel}
                    disabled={!incrementZoomLevel}
                    variant="tertiary"
                    sx={{
                      minWidth: "unset",
                      minHeight: "unset",
                      padding: 0.5,
                      borderBottomLeftRadius: 0,
                      borderBottomRightRadius: 0,
                      borderBottomWidth: 0,
                    }}
                  >
                    <FontAwesomeIcon icon={faPlus} />
                  </Button>
                  <Button
                    onClick={decrementZoomLevel}
                    disabled={!decrementZoomLevel}
                    variant="tertiary"
                    sx={{
                      minWidth: "unset",
                      minHeight: "unset",
                      padding: 0.5,
                      borderTopLeftRadius: 0,
                      borderTopRightRadius: 0,
                    }}
                  >
                    <FontAwesomeIcon icon={faMinus} />
                  </Button>
                </Stack>
              </Fade>
            ) : null}

            <Typography
              sx={{
                position: "absolute",
                bottom: 13,
                right: 13,
                color: ({ palette }) => palette.common.black,
                opacity: 0.5,
                fontSize: 9,
                lineHeight: "11px",
              }}
            >
              ©{" "}
              <Link
                href="https://www.mapbox.com/about/maps/"
                target="_blank"
                sx={{
                  color: "inherit !important",
                  textDecoration: "none !important",
                }}
              >
                Mapbox
              </Link>{" "}
              ©{" "}
              <Link
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                sx={{
                  color: "inherit !important",
                  textDecoration: "none !important",
                }}
              >
                OpenStreetMap
              </Link>
            </Typography>
          </Box>
        ) : (
          <CircularProgress sx={{ color: ({ palette }) => palette.gray[40] }} />
        )}

        {!readonly ? (
          <Fade in={hovered}>
            <Button
              size="small"
              onClick={onClose}
              variant="tertiary"
              sx={({ palette }) => ({
                position: "absolute",
                top: 4,
                right: 4,
                padding: 0.5,
                background: "transparent !important",
                fontSize: 12,
                fontWeight: 600,
                lineHeight: "18px",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                border: "none",
                fill: palette.gray[70],
                ":hover": {
                  fill: palette.gray[80],
                },
              })}
              endIcon={
                <FontAwesomeIcon
                  icon={faArrowRotateLeft}
                  sx={{ fill: "inherit" }}
                />
              }
            >
              Clear location
            </Button>
          </Fade>
        ) : null}
      </Box>
    </Card>
  );
};
