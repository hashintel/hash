import { faPenToSquare } from "@fortawesome/free-regular-svg-icons";
import { faClose } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@local/design-system";
import {
  Box,
  Button,
  ButtonProps,
  Card,
  CircularProgress,
  Fade,
  Link,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { EditableField } from "./editable-field";
import { AppleIcon } from "./icons/apple-icon";
import { GoogleIcon } from "./icons/google-icon";

const MapButton = ({ children, href, sx, ...props }: ButtonProps) => {
  return (
    <Link
      href={href}
      sx={{
        textDecoration: "none",
      }}
    >
      <Button
        {...props}
        variant="tertiary_quiet"
        sx={[
          ({ palette }) => ({
            height: 42,
            fontWeight: 500,
            fontSize: 14,
            lineHeight: "18px",
            color: palette.gray[80],
            border: `1px solid ${palette.gray[30]}`,
            whiteSpace: "nowrap",
            textTransform: "none",
            paddingY: 1.5,
            paddingX: 2.5,
          }),
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        {children}
      </Button>
    </Link>
  );
};

type AddressCardProps = {
  title?: string;
  description?: string;
  fullAddress: string;
  mapUrl?: string;
  hovered: boolean;
  readonly?: boolean;
  onClose: () => void;
  updateTitle: (title: string) => void;
  updateDescription: (description: string) => void;
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
    () => [
      `https://www.google.com/maps?q=${encodeURI(fullAddress)}`,
      `http://maps.apple.com/?q=${encodeURI(fullAddress)}`,
    ],
    [fullAddress],
  );

  return (
    <Card
      sx={{
        display: "flex",
        border: ({ palette }) => `1px solid ${palette.gray[20]}`,
        borderRadius: 2.5,
        boxShadow: "none",
        [theme.breakpoints.down("md")]: {
          flexDirection: "column",
        },
      }}
    >
      <Stack
        sx={{
          display: "flex",
          justifyContent: "space-between",
          paddingY: 3,
          paddingX: 3.75,
          gap: 4,
          width: 300,
          [theme.breakpoints.down("md")]: {
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
        </Stack>

        <Stack gap={1.5}>
          <MapButton href={googleMapsUrl}>
            <GoogleIcon sx={{ fontSize: 18, mr: 1 }} />
            Open in Google Maps
          </MapButton>
          <MapButton href={appleMapsUrl}>
            <AppleIcon sx={{ fontSize: 18, mr: 1 }} />
            Open in Apple Maps
          </MapButton>
        </Stack>

        {description || editingDescription || readonly ? (
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
        ) : (
          <Typography
            onClick={() => {
              setEditingDescription(true);
            }}
            sx={{
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
        )}
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
          [theme.breakpoints.down("md")]: {
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
          />
        ) : (
          <CircularProgress sx={{ color: ({ palette }) => palette.gray[40] }} />
        )}

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
              <FontAwesomeIcon icon={faClose} sx={{ fill: "inherit" }} />
            }
          >
            Close
          </Button>
        </Fade>
      </Box>
    </Card>
  );
};
