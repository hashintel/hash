import { Box } from "@mui/material";

export const BouncingDotsLoader = () => {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        ml: 0.5,
        "& > div": {
          width: 4,
          height: 4,
          marginTop: 0.5,
          marginX: 0.125,
          borderRadius: "50%",
          background: ({ palette }) => palette.common.black,
          animation: "bouncing-loader 0.6s infinite alternate",
        },

        "& > div:nth-of-type(2)": {
          animationDelay: "0.2s",
        },
        "& > div:nth-of-type(3)": {
          animationDelay: "0.4s",
        },

        "@keyframes bouncing-loader": {
          to: {
            transform: "translateY(-6px)",
          },
        },
      }}
    >
      <Box />
      <Box />
      <Box />
    </Box>
  );
};
