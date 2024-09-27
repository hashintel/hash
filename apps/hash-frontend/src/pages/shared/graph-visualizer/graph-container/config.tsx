import { GearIcon } from "@hashintel/block-design-system";
import { IconButton, Select } from "@hashintel/design-system";
import { Box, outlinedInputClasses, Stack, Typography } from "@mui/material";
import type { FunctionComponent, RefObject } from "react";
import { useRef, useState } from "react";

import { ArrowRightToLineIcon } from "../../../../shared/icons/arrow-right-to-line-icon";
import { MenuItem } from "../../../../shared/ui/menu-item";
import { buttonSx } from "./shared/button-styles";

export type GraphConfig = {
  highlightDepth: number;
  highlightDirection: "All" | "In" | "Out";
};

export const ConfigPanel: FunctionComponent<{
  containerRef: RefObject<HTMLDivElement>;
  config: GraphConfig;
  setConfig: (config: GraphConfig) => void;
  open: boolean;
  onClose: () => void;
}> = ({ containerRef, config, setConfig, open, onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  return (
    <Box
      ref={panelRef}
      sx={{
        zIndex: 1,
        position: "absolute",
        right: 0,
        top: 0,
        transform: open ? "translateX(0%)" : "translateX(100%)",
        maxHeight: ({ spacing }) => `calc(100% - ${spacing(4)})`,
        transition: ({ transitions }) => transitions.create(["transform"]),
        pt: 1,
        pr: 1.8,
        pl: 2,
        pb: 2,
        background: ({ palette }) => palette.white,
        borderWidth: 1,
        borderColor: ({ palette }) => palette.gray[20],
        borderStyle: "solid",
        borderTopWidth: 0,
        borderRightWidth: 0,
        borderLeftWidth: 1,
        borderBottomLeftRadius: 4,
        minWidth: 150,
        overflowY: "auto",
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography
          sx={{
            color: ({ palette }) => palette.gray[90],
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Configuration
        </Typography>
        <IconButton
          onClick={() => onClose()}
          sx={{
            padding: 0.5,
            svg: {
              fontSize: 16,
              color: ({ palette }) => palette.gray[50],
            },
            transform: "rotate(180deg)",
          }}
        >
          <ArrowRightToLineIcon />
        </IconButton>
      </Stack>
      <Box>
        <Stack mt={1.5}>
          <Typography
            sx={{
              color: ({ palette }) => palette.gray[80],
              fontWeight: 600,
              letterSpacing: 0.2,
            }}
            variant="smallCaps"
          >
            Depth
          </Typography>
          <Box
            component="input"
            type="number"
            value={config.highlightDepth.toString()}
            onChange={(event) =>
              setConfig({
                ...config,
                highlightDepth: parseInt(event.target.value, 10),
              })
            }
            sx={({ palette }) => ({
              border: `1px solid ${palette.gray[30]}`,
              borderRadius: 1,
              fontSize: 14,
              py: 1.2,
              px: 1.5,
              mt: 0.5,
            })}
          />
        </Stack>
        <Stack mt={2}>
          <Typography
            component="div"
            sx={{
              color: ({ palette }) => palette.gray[80],
              fontWeight: 600,
              letterSpacing: 0.2,
            }}
            variant="smallCaps"
          >
            Direction
          </Typography>
          <Select
            value={config.highlightDirection}
            onChange={(event) =>
              setConfig({
                ...config,
                highlightDirection: event.target
                  .value as GraphConfig["highlightDirection"],
              })
            }
            MenuProps={{
              container: containerRef.current,
            }}
            sx={{
              [`.${outlinedInputClasses.root} .${outlinedInputClasses.input}`]:
                {
                  fontSize: 14,
                  px: 1.5,
                  py: 1,
                },
              width: 160,
            }}
          >
            {["All", "In", "Out"].map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </Stack>
      </Box>
    </Box>
  );
};

export const Config = ({
  containerRef,
  config,
  setConfig,
}: {
  containerRef: RefObject<HTMLDivElement>;
  config: GraphConfig;
  setConfig: (config: GraphConfig) => void;
}) => {
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  return (
    <>
      <ConfigPanel
        containerRef={containerRef}
        config={config}
        setConfig={setConfig}
        open={showConfigPanel}
        onClose={() => setShowConfigPanel(false)}
      />
      <IconButton
        onClick={() => setShowConfigPanel(true)}
        sx={[buttonSx, { top: 8, right: 13 }]}
      >
        <GearIcon />
      </IconButton>
    </>
  );
};
