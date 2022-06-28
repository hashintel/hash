import { MenuCheckboxItem } from "@hashintel/hash-design-system";
import {
  Paper,
  Typography,
  Box,
  Stack,
  Divider,
  typographyClasses,
  Menu,
  MenuItem,
  ListItemIcon,
  styled,
  BoxProps,
  ListItemText,
} from "@mui/material";
import { startCase } from "lodash";
import * as React from "react";
import { ChevronDownIcon, CheckDoubleIcon, ClearIcon } from "../icons";
import { getEventTypeColor } from "../utils";

type ConfigPanelProps = {
  possibleEventTypes: string[];
  selectedEventTypes: string[];
  setSelectedEventTypes: React.Dispatch<React.SetStateAction<string[]>>;
};

const FilterBtn = styled(({ ...props }: BoxProps) => (
  <Box component="button" {...props} />
))(({ theme }) => ({
  backgroundColor: "transparent",
  border: "none",
  padding: `${theme.spacing(1.5)} ${theme.spacing(2)}`,
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",

  "&:hover": {
    background: theme.palette.gray[10],
  },

  [`.${typographyClasses.root}`]: {
    color: theme.palette.gray[80],
    fontWeight: 500,
    marginRight: theme.spacing(1),
  },

  svg: {
    fontSize: 12,
    color: theme.palette.gray[50],
  },
}));

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  possibleEventTypes,
  selectedEventTypes,
  setSelectedEventTypes,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);

  const toggleEventType = (data: string) => {
    setSelectedEventTypes((prev) => {
      if (prev.includes(data)) {
        return prev.filter((eventType) => eventType !== data);
      }
      return [...prev, data];
    });
  };

  const toggleSelectAllEventTypes = () => {
    if (possibleEventTypes.length === selectedEventTypes.length) {
      setSelectedEventTypes([]);
    } else {
      setSelectedEventTypes(possibleEventTypes);
    }
  };

  const popoverId = anchorEl ? "timeline-config-popover" : undefined;

  const allItemsSelected =
    possibleEventTypes.length === selectedEventTypes.length;

  return (
    <>
      <Paper
        sx={({ palette }) => ({
          backgroundColor: palette.white,
          alignSelf: "flex-start",
          minWidth: 170,
          zIndex: 1,
          mt: 2,
        })}
      >
        <Typography fontWeight="bold" px={2} pt={1.5} mb={1.75}>
          Events
        </Typography>
        <Box component="ul" px={2}>
          {selectedEventTypes.map((eventType, idx) => (
            <Stack
              direction="row"
              spacing={1}
              key={eventType}
              component="li"
              sx={({ palette, typography }) => ({
                ...typography.microText,
                mb: idx < selectedEventTypes.length - 1 ? 1 : 2,
                alignItems: "center",
                color: palette.gray[70],
              })}
            >
              <Box
                sx={{
                  height: 12,
                  width: 12,
                  borderRadius: "50%",
                  backgroundColor: getEventTypeColor(eventType),
                }}
              />
              <Box component="span">{startCase(eventType)}</Box>
            </Stack>
          ))}
        </Box>
        <Divider />

        <FilterBtn
          aria-describedby={popoverId}
          onClick={(evt) => setAnchorEl(evt.currentTarget)}
        >
          <Typography>Filter events</Typography>
          <ChevronDownIcon />
        </FilterBtn>
      </Paper>
      <Menu
        id={popoverId}
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
      >
        {possibleEventTypes.map((eventType) => (
          <MenuCheckboxItem
            key={eventType}
            onClick={() => toggleEventType(eventType)}
            selected={selectedEventTypes.includes(eventType)}
          >
            {startCase(eventType)}
          </MenuCheckboxItem>
        ))}
        <Divider />
        <MenuItem onClick={toggleSelectAllEventTypes}>
          <ListItemIcon>
            {allItemsSelected ? <ClearIcon /> : <CheckDoubleIcon />}
          </ListItemIcon>
          <ListItemText
            primary={allItemsSelected ? "Clear All" : "Select All"}
          />
        </MenuItem>
      </Menu>
    </>
  );
};
