import { faCirclePlus, FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Typography } from "@mui/material";

export const ShowUploadFormButton = ({ onClick }: { onClick: () => void }) => (
  <Box
    component="button"
    onClick={onClick}
    sx={{
      alignItems: "center",
      background: "none",
      border: "none",
      cursor: "pointer",
      display: "flex",
      justifyContent: "center",
      py: 2,
      width: "100%",
      "&:hover": {
        span: {
          color: "gray.70",
        },
        svg: {
          color: "gray.70",
        },
      },
    }}
    type="button"
  >
    <FontAwesomeIcon
      icon={{
        icon: faCirclePlus,
      }}
      sx={{
        color: "gray.50",
        fontSize: 12,
        mr: 1,
        transition: ({ transitions }) => transitions.create("color"),
      }}
    />
    <Typography
      variant="smallTextLabels"
      sx={{
        fontWeight: 500,
        color: "gray.50",
        transition: ({ transitions }) => transitions.create("color"),
      }}
    >
      Upload file
    </Typography>
  </Box>
);
