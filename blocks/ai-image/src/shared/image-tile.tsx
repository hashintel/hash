import { useState } from "react";
import { Box, Skeleton } from "@mui/material";

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
          variant={"rectangular"}
          width={"100%"}
          height={"100%"}
          sx={{ transform: "unset" }}
        />
      ) : null}
      <img
        alt={description}
        src={url}
        style={{
          display: loading ? "none" : "block",
          objectFit,
          width: "100%",
          height: "100%",
        }}
        onLoad={() => {
          setLoading(false);
        }}
      />
    </Box>
  );
};
