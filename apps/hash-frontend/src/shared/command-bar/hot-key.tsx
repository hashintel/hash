import { Box } from "@mui/material";

export const HotKey = ({
  label,
  keysList,
}: {
  label: string;
  keysList?: string[];
}) => (
  <Box
    display={"flex"}
    alignItems={"center"}
    width={"100%"}
    justifyContent={"space-between"}
  >
    {label}
    {keysList ? (
      <Box display={"flex"} alignItems={"center"} gap={0.5} flexGrow={0}>
        {keysList.map((key) => (
          <Box
            key={key}
            borderRadius={1}
            bgcolor={(theme) => theme.palette.blue[30]}
            px={1}
          >
            {key.toLowerCase() === "meta" ? "⌘" : key.toUpperCase()}
          </Box>
        ))}
      </Box>
    ) : null}
  </Box>
);
