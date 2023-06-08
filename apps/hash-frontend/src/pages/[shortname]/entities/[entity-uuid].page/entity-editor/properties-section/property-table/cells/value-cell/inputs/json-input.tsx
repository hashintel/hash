import { faCheck, faClose } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  GRID_CLICK_IGNORE_CLASS,
  IconButton,
} from "@hashintel/design-system";
import { Box, Popper, Tooltip, Typography } from "@mui/material";
import { useState } from "react";

import { JsonEditor } from "./json-input/json-editor";
import { CellInputProps } from "./types";

const isJsonObjectString = (str?: string) => {
  if (!str || str.trim()[0] !== "{") {
    return false;
  }

  try {
    JSON.parse(str);
  } catch (err) {
    return false;
  }
  return true;
};

export const JsonInput = ({ onChange, value }: CellInputProps<any>) => {
  const [innerValue, setInnerValue] = useState(
    JSON.stringify(value, undefined, 2),
  );

  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);

  const isValid = isJsonObjectString(innerValue);

  return (
    <>
      <Box ref={setAnchorEl} sx={{ width: "100%" }} />
      <Popper
        className={GRID_CLICK_IGNORE_CLASS}
        open={!!anchorEl}
        anchorEl={anchorEl}
        sx={{
          outline: "none",
          p: "0px !important",
          borderRadius: 2,
          overflow: "hidden",
          border: 1,
          borderColor: "gray.50",
          bgcolor: "gray.90",
          width: anchorEl?.clientWidth,
          minWidth: 375,
          zIndex: ({ zIndex }) => zIndex.modal,
        }}
      >
        <>
          <JsonEditor
            height={300}
            value={innerValue}
            onChange={(val) => setInnerValue(val)}
          />
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography
              variant="smallCaps"
              sx={{ color: "red.70", pl: 2, pb: 1 }}
            >
              {!isValid && "Invalid JSON Object"}
            </Typography>

            <Box
              sx={{
                display: "flex",
                alignSelf: "flex-end",

                bottom: 0,
                right: 0,
                gap: 0.5,
                p: 0.5,
              }}
            >
              <Tooltip
                title="Discard Changes"
                placement="top"
                disableInteractive
              >
                <IconButton
                  rounded
                  sx={{ color: "white" }}
                  onClick={() => onChange(value, true)}
                >
                  <FontAwesomeIcon icon={faClose} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Save Changes" placement="top" disableInteractive>
                <IconButton
                  disabled={!isValid}
                  rounded
                  sx={{ color: "white" }}
                  onClick={() => {
                    onChange(JSON.parse(innerValue));
                  }}
                >
                  <FontAwesomeIcon icon={faCheck} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </>
      </Popper>
    </>
  );
};
