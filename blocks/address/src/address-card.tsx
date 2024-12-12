import { faCopy } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowRotateLeft,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { EditableField } from "@hashintel/block-design-system";
import { Button, FontAwesomeIcon, Skeleton } from "@hashintel/design-system";
import {
  Box,
  CircularProgress,
  Fade,
  // @todo: https://linear.app/hash/issue/H-3769/investigate-new-eslint-errors
  // eslint-disable-next-line no-restricted-imports
  Link,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ContentStack } from "./address-card/content-stack";
import { MapWrapper } from "./address-card/map-wrapper";
import { StyledCard } from "./address-card/styled-card";
import { AppleIcon } from "./icons/apple-icon";
import { GoogleIcon } from "./icons/google-icon";
import { MapButton } from "./map-button";

type AddressCardProps = {
  title?: string;
  description?: string;
  fullAddress: string;
  mapUrl?: string;
  mapError?: boolean;
  hovered: boolean;
  readonly?: boolean;
  isMobile?: boolean;
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
  mapError,
  hovered,
  readonly,
  isMobile,
  onClose,
  updateTitle,
  updateDescription,
  incrementZoomLevel,
  decrementZoomLevel,
}: AddressCardProps) => {
  const theme = useTheme();
  const [titleValue, setTitleValue] = useState(title);
  const [descriptionValue, setDescriptionValue] = useState(description);

  useEffect(() => {
    if (title !== titleValue) {
      setTitleValue(title);
    }
    // We want to override titleValue with value only when title changes
    // otherwise we would lose the changes made to titleValue whenever it is set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  useEffect(() => {
    if (description !== descriptionValue) {
      setDescriptionValue(description);
    }
    // We want to override descriptionValue with value only when description changes
    // otherwise we would lose the changes made to descriptionValue whenever it is set
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      void navigator.clipboard.writeText(fullAddress);
    }
  }, [fullAddress]);

  return (
    <StyledCard isMobile={isMobile}>
      <ContentStack isMobile={isMobile}>
        <Stack gap={1.5}>
          <EditableField
            value={titleValue}
            placeholder="Enter title"
            onChange={(event) => setTitleValue(event.target.value)}
            onBlur={(event) => updateTitle(event.target.value)}
            readonly={readonly}
            sx={{
              fontWeight: 700,
              fontSize: 21,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: theme.palette.common.black,
            }}
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
        <Stack sx={{ flexDirection: "row", flexWrap: "wrap", gap: 1.5 }}>
          {googleMapsUrl ? (
            <Box>
              <MapButton href={googleMapsUrl}>
                <GoogleIcon sx={{ fontSize: 18, mr: 1 }} />
                Open in Google Maps
              </MapButton>
            </Box>
          ) : null}
          {appleMapsUrl ? (
            <Box>
              <MapButton href={appleMapsUrl}>
                <AppleIcon sx={{ fontSize: 18, mr: 1 }} />
                Open in Apple Maps
              </MapButton>
            </Box>
          ) : null}
        </Stack>

        <EditableField
          editIconFontSize={14}
          value={descriptionValue}
          placeholder="Click here to add a description or more detailed information"
          onChange={(event) => setDescriptionValue(event.target.value)}
          onBlur={(event) => {
            updateDescription(event.target.value);
          }}
          readonly={readonly}
          sx={{
            fontWeight: 500,
            fontSize: 14,
            lineHeight: 1.3,
            letterSpacing: "-0.02em",
            color: theme.palette.gray[90],
          }}
        />
      </ContentStack>

      <MapWrapper isMobile={isMobile}>
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

        {mapUrl ? (
          <Box
            sx={{
              width: 1,
              height: 1,
              background: `url(${mapUrl}) no-repeat`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
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
        ) : mapError ? (
          <Typography
            sx={{
              color: ({ palette }) => palette.common.black,
              opacity: 0.5,
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            There was a problem loading the map
          </Typography>
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
                minHeight: 0,
                top: 0,
                right: 0,
                paddingX: 1.25,
                paddingY: 0.5,
                fontSize: 12,
                fontWeight: 400,
                lineHeight: "26px",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                border: "none",
                fill: palette.white,
                color: palette.white,
                background: `${palette.black}A8`,
                borderRadius: 0,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                boxShadow:
                  "0px 11px 30px rgba(61, 78, 133, 0.04), 0px 7.12963px 18.37px rgba(61, 78, 133, 0.05), 0px 4.23704px 8.1px rgba(61, 78, 133, 0.06), 0px 0.203704px 0.62963px rgba(61, 78, 133, 0.07)",
                ":hover": {
                  color: palette.white,
                  background: palette.black,
                },
              })}
              startIcon={
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
      </MapWrapper>
    </StyledCard>
  );
};

export const AddressCardLoading = ({ isMobile }: { isMobile: boolean }) => {
  return (
    <StyledCard isMobile={isMobile}>
      <ContentStack isMobile={isMobile}>
        <Stack gap={1.5}>
          <Skeleton style={{ fontSize: 21 }} />
          <Skeleton style={{ lineHeight: 1.3, marginBottom: 2 }} />
        </Stack>

        <Stack sx={{ flexDirection: "row", flexWrap: "wrap", gap: 1.5 }}>
          <Skeleton style={{ height: 46, width: 200, marginBottom: 2 }} />
          <Skeleton style={{ height: 46, width: 200, marginBottom: 2 }} />
        </Stack>

        <Skeleton style={{ height: isMobile ? 18 : 36 }} />
      </ContentStack>

      <MapWrapper isMobile={isMobile}>
        <CircularProgress sx={{ color: ({ palette }) => palette.gray[40] }} />
      </MapWrapper>
    </StyledCard>
  );
};
