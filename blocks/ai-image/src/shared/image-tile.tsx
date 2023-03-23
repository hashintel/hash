import { Box, Skeleton } from "@mui/material";
import { useState } from "react";

export const ImageTile = ({
  description,
  url,
  maxWidth,
  objectFit = "contain",
}: {
  description: string;
  url?: string;
  maxWidth: number;
  objectFit?: "contain" | "cover";
}) => {
  const [loading, setLoading] = useState(true);

  return (
    <Box
      sx={{
        width: "100%",
        height: "auto",
        maxWidth,
        aspectRatio: "1 / 1",
      }}
    >
      {loading ? (
        <Skeleton
          variant="rectangular"
          width="100%"
          height="100%"
          sx={{ transform: "unset" }}
        />
      ) : null}
      <img
        alt={description}
        src={url}
        onLoad={() => setLoading(false)}
        style={{
          display: loading ? "none" : "block",
          objectFit,
          width: "100%",
          height: "100%",
        }}
      />
    </Box>
  );
};
