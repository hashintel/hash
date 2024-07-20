import { useState } from "react";
import { faCheck, faClose } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import { GRID_CLICK_IGNORE_CLASS } from "@hashintel/design-system/constants";
import { Box, Popper, Tooltip, Typography } from "@mui/material";

import { JsonEditor } from "./json-input/json-editor";
import type { CellInputProps } from "./types";

const isJsonObjectString = (string_?: string) => {
  if (!string_?.trim().startsWith("{")) {
    return false;
  }

  try {
    JSON.parse(string_);
  } catch (error) {
    return false;
  }

  return true;
};

export const JsonInput = ({ onChange, value }: CellInputProps<unknown>) => {
  const [innerValue, setInnerValue] = useState(
    JSON.stringify(value, undefined, 2),
  );

  const [anchorElement, setAnchorElement] = useState<HTMLDivElement | null>(null);

  const isValid = isJsonObjectString(innerValue);

  return (
    <>
      <Box ref={setAnchorElement} sx={{ width: "100%" }} />
      <Popper
        className={GRID_CLICK_IGNORE_CLASS}
        open={Boolean(anchorElement)}
        anchorEl={anchorElement}
        sx={{
          outline: "none",
          p: "0px !important",
          borderRadius: 2,
          overflow: "hidden",
          border: 1,
          borderColor: "gray.50",
          bgcolor: "gray.90",
          width: anchorElement?.clientWidth,
          minWidth: 375,
          zIndex: ({ zIndex }) => zIndex.modal,
        }}
      >
        <>
          <JsonEditor
            height={300}
            value={innerValue}
            onChange={(value_) => { setInnerValue(value_); }}
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
              variant={"smallCaps"}
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
                disableInteractive
                title={"Discard Changes"}
                placement={"top"}
              >
                <IconButton
                  rounded
                  sx={{ color: "white" }}
                  onClick={() => { onChange(value, true); }}
                >
                  <FontAwesomeIcon icon={faClose} />
                </IconButton>
              </Tooltip>
              <Tooltip disableInteractive title={"Save Changes"} placement={"top"}>
                <Box>
                  <IconButton
                    rounded
                    disabled={!isValid}
                    sx={{ color: ({ palette }) => palette.common.white }}
                    onClick={() => {
                      onChange(JSON.parse(innerValue));
                    }}
                  >
                    <FontAwesomeIcon icon={faCheck} />
                  </IconButton>
                </Box>
              </Tooltip>
            </Box>
          </Box>
        </>
      </Popper>
    </>
  );
};
