import "mapbox-gl/dist/mapbox-gl.css";
import Box from "@mui/material/Box";
import {
  Button,
  ButtonProps,
  Card,
  CircularProgress,
  Link,
  Stack,
  styled,
  Typography,
} from "@mui/material";
import { Address } from "./useMapbox";
import { PenToSquareIcon } from "./icons/pen-to-square-icon";
import IconButton from "@mui/material/IconButton";
import { useRef, useState } from "react";
import Fade from "@mui/material/Fade";
import { GoogleIcon } from "./icons/google-icon";
import { AppleIcon } from "./icons/apple-icon";
import CloseIcon from "@mui/icons-material/Close";

const HeadingTypography = styled(Typography)(() => ({
  fontFamily: "Inter",
  fontWeight: 700,
  fontSize: 21,
  lineHeight: 1,
  letterSpacing: "-0.02em",
  color: "#000000",
}));
const BodyTypography = styled(Typography)(() => ({
  fontFamily: "Inter",
  fontWeight: 500,
  fontSize: 16,
  lineHeight: 1.3,
  letterSpacing: "-0.02em",
  color: "#37434F",
  maxWidth: "100%",
}));

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
  label: string;
  address: Address;
  hovered: boolean;
  onClose: () => void;
};

export const AddressCard = ({
  address,
  hovered,
  onClose,
}: AddressCardProps) => {
  const [labelHovered, setLabelHovered] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);

  const labelRef = useRef<HTMLSpanElement | null>(null);

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
          {/* <TextField
            value={address.properties.feature_name}
            InputProps={{
              endAdornment: (
                <IconButton onClick={() => setEditingLabel(!editingLabel)}>
                  <PenToSquareIcon />
                </IconButton>
              ),
              readOnly: !editingLabel,
              sx: {
                ...(!editingLabel
                  ? {
                      [`.${outlinedInputClasses.notchedOutline}`]: {
                        borderWidth: "0 !important",
                      },
                    }
                  : {}),
              },
            }}
            sx={{}}
          /> */}

          <Box
            onMouseEnter={() => setLabelHovered(true)}
            onMouseLeave={() => setLabelHovered(false)}
            sx={{
              display: "flex",
            }}
          >
            <HeadingTypography
              contentEditable={editingLabel}
              sx={{ maxWidth: "calc(100% - 37px)" }}
              ref={labelRef}
            >
              {address.label}
            </HeadingTypography>
            <Fade in={labelHovered}>
              <Box sx={{ position: "relative" }}>
                <IconButton
                  onClick={() => {
                    setEditingLabel(!editingLabel);
                    labelRef.current?.focus();
                  }}
                  sx={{
                    position: "absolute",
                    top: -4,
                    ml: 1,
                    padding: 0.5,
                  }}
                >
                  <PenToSquareIcon sx={{ fontSize: 21 }} />
                </IconButton>
              </Box>
            </Fade>
          </Box>

          <BodyTypography>{address.fullAddress}</BodyTypography>
        </Stack>

        <Box>
          <MapButton
            href={`https://www.google.com/maps?q=${encodeURI(
              address.fullAddress,
            )}`}
            sx={{ mb: 1.5 }}
          >
            <GoogleIcon sx={{ fontSize: 18, mr: 1 }} />
            Open in Google Maps
          </MapButton>
          <MapButton
            href={`http://maps.apple.com/?q=${encodeURI(address.fullAddress)}`}
          >
            <AppleIcon sx={{ fontSize: 18, mr: 1 }} />
            Open in Apple Maps
          </MapButton>
        </Box>

        <BodyTypography sx={{ fontSize: 14 }}>description here</BodyTypography>
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
        {address.mapUrl ? (
          <Box
            sx={{
              width: 1,
              height: 1,
              background: `url(${address.mapUrl}) no-repeat`,
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
