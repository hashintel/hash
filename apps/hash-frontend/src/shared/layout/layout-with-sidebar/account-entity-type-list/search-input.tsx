import { faXmark } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  IconButton,
  TextField,
} from "@hashintel/design-system";
import { Fade, outlinedInputClasses, Tooltip } from "@mui/material";
import type { FunctionComponent } from "react";

import { MagnifyingGlassLightIcon } from "../../../icons/magnifying-glass-light";

type SearchInputProps = {
  searchVisible: boolean;
  showSearchInput: () => void;
  hideSearchInput: () => void;
  onChangeText: (text: string) => void;
};

export const SearchInput: FunctionComponent<SearchInputProps> = ({
  searchVisible,
  showSearchInput,
  hideSearchInput,
  onChangeText,
}) => (
  <>
    <Tooltip title="Search for types">
      <IconButton
        size="medium"
        sx={({ palette }) => ({
          color: palette.gray[50],
          svg: { fontSize: 14 },
        })}
        onClick={() => showSearchInput()}
      >
        <MagnifyingGlassLightIcon />
      </IconButton>
    </Tooltip>
    <Fade in={searchVisible} mountOnEnter unmountOnExit>
      <TextField
        variant="outlined"
        size="small"
        autoFocus
        placeholder="Search for types"
        onChange={(evt) => onChangeText(evt.target.value)}
        sx={({ palette }) => ({
          position: "absolute",
          right: 0,
          width: ({ spacing }) => `calc(100% - ${spacing(1.75)})`,
          height: "100%",
          borderRadius: "4px",
          backgroundColor: palette.white,
          [`.${outlinedInputClasses.notchedOutline}`]: {
            borderRadius: "4px",
          },
          [`.${outlinedInputClasses.focused} .${outlinedInputClasses.notchedOutline}`]:
            {
              borderColor: palette.blue[60],
            },
        })}
        InputProps={{
          sx: ({ typography, palette }) => ({
            ...typography.smallTextLabels,
            color: palette.gray[80],
            fontWeight: 500,
            pl: 1.5,
            pr: 1,
            boxShadow: "none",
            [`& .${outlinedInputClasses.input}`]: {
              px: 0,
              py: 0.875,
              "&::placeholder": {
                color: palette.gray[50],
                opacity: 1,
              },
            },
          }),

          endAdornment: (
            <Tooltip
              title="Clear Search"
              PopperProps={{
                modifiers: [
                  {
                    name: "offset",
                    options: { offset: [-1, 0] },
                  },
                ],
              }}
            >
              <IconButton onClick={hideSearchInput} size="small" unpadded>
                <FontAwesomeIcon icon={faXmark} />
              </IconButton>
            </Tooltip>
          ),
        }}
      />
    </Fade>
  </>
);
