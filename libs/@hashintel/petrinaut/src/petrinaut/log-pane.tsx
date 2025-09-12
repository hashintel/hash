import { CaretDownSolidIcon, IconButton } from "@hashintel/design-system";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";

import { useSimulationContext } from "./simulation-context";

export const LogPane = () => {
  const { simulationLogs } = useSimulationContext();
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (expanded && logsContainerRef.current) {
      logsContainerRef.current.scrollTo({
        top: logsContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [simulationLogs, expanded]);

  if (simulationLogs.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "absolute",
        bottom: 16,
        left: 16,
        zIndex: 100,
        width: 350,
        py: 1.2,
        pl: 1.5,
        borderRadius: 1,
        bgcolor: "background.paper",
        boxShadow: 1,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <IconButton
        onClick={() => setExpanded(!expanded)}
        sx={({ transitions }) => ({
          display: "flex",
          justifyContent: "space-between",
          p: 0,
          pr: 1.5,
          alignItems: "center",
          "&:hover": {
            backgroundColor: "transparent",
            "& svg, & span": { color: ({ palette }) => palette.common.black },
          },
          "& svg": {
            transform: expanded ? "none" : "rotate(-90deg)",
            transition: transitions.create(["transform", "color"], {
              duration: 200,
            }),
            position: "relative",
            top: expanded ? -2 : 0,
          },
          width: "100%",
        })}
      >
        <Typography
          variant="smallCaps"
          sx={({ transitions }) => ({
            color: ({ palette }) => palette.gray[70],
            transition: transitions.create("color", {
              duration: 200,
            }),
          })}
        >
          Simulation Logs
        </Typography>
        <CaretDownSolidIcon
          sx={{
            color: ({ palette }) => palette.gray[50],
          }}
        />
      </IconButton>
      <Collapse in={expanded}>
        <Stack
          ref={logsContainerRef}
          spacing={0.5}
          sx={{ maxHeight: 200, overflow: "auto", pr: 1.5, mt: 1 }}
        >
          {simulationLogs.map((log) => (
            <Typography
              key={log.id}
              sx={{
                fontSize: 12,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {log.text}
            </Typography>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
};
