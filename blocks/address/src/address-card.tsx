import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Button,
  ButtonProps,
  Card,
  CircularProgress,
  Fade,
  IconButton,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import { useMemo } from "react";
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
        sx={[
          {
            fontFamily: "Inter",
            height: 42,
            fontWeight: 500,
            fontSize: 14,
            lineHeight: "18px",
            color: "#4D5C6C",
            border: "1px solid #DDE7F0",
            whiteSpace: "nowrap",
            textTransform: "none",
            padding: ({ spacing }) => `${spacing(1.5)} ${spacing(2.5)}`,
          },
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
  onClose,
  updateTitle,
  updateDescription,
}: AddressCardProps) => {
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
        border: "1px solid #EBF2F7",
        borderRadius: 2.5,
        boxShadow: "none",
        maxWidth: 800,
      }}
    >
      <Stack
        sx={{
          display: "flex",
          justifyContent: "space-between",
          padding: ({ spacing }) => `${spacing(3)} ${spacing(3.75)}`,
          gap: 4,
          maxWidth: 300,
        }}
      >
        <Stack gap={1.5}>
          <EditableField
            defaultValue={title}
            onBlur={(event) => updateTitle(event.target.value)}
            inputProps={{
              sx: {
                fontFamily: "Inter",
                fontWeight: 700,
                fontSize: 21,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                color: "#000",
              },
            }}
          />

          <Typography
            sx={{
              fontFamily: "Inter",
              fontWeight: 500,
              fontSize: 16,
              lineHeight: 1.3,
              letterSpacing: "-0.02em",
              color: "#37434F",
              maxWidth: "100%",
            }}
          >
            {fullAddress}
          </Typography>
        </Stack>

        <Box>
          <MapButton href={googleMapsUrl} sx={{ mb: 1.5 }}>
            <GoogleIcon sx={{ fontSize: 18, mr: 1 }} />
            Open in Google Maps
          </MapButton>
          <MapButton href={appleMapsUrl}>
            <AppleIcon sx={{ fontSize: 18, mr: 1 }} />
            Open in Apple Maps
          </MapButton>
        </Box>

        <EditableField
          defaultValue={description}
          onBlur={(event) => updateDescription(event.target.value)}
          placeholder="Description here"
          inputProps={{
            sx: {
              fontFamily: "Inter",
              fontWeight: 500,
              fontSize: 16,
              lineHeight: 1.3,
              letterSpacing: "-0.02em",
              color: "#37434F",
            },
          }}
        />
      </Stack>

      <Box
        sx={{
          width: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F7FAFC",
          borderLeft: "1px solid #EBF2F7",
          maxWidth: 500,
          position: "relative",
        }}
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
          <CircularProgress sx={{ color: "#C1CFDE" }} />
        )}

        <Fade in={hovered}>
          <IconButton
            onClick={onClose}
            sx={{
              position: "absolute",
              top: 4,
              right: 4,
              padding: 0.5,
            }}
          >
            <CloseIcon />
          </IconButton>
        </Fade>
      </Box>
    </Card>
  );
};
