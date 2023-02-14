import { MenuCheckboxItem } from "@hashintel/design-system";
import {
  Box,
  BoxProps,
  Collapse,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  MenuList,
  Paper,
  Stack,
  styled,
  Typography,
  typographyClasses,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { startCase } from "lodash";
import { Dispatch, FunctionComponent, SetStateAction, useState } from "react";

import { CheckDoubleIcon, ChevronDownIcon, ClearIcon } from "../icons";
import { getEventTypeColor } from "../utils";

type ConfigPanelProps = {
  possibleEventTypes: string[];
  selectedEventTypes: string[];
  setSelectedEventTypes: Dispatch<SetStateAction<string[]>>;
};

const FilterBtn = styled(({ ...props }: BoxProps) => (
  <Box component="button" {...props} />
))(({ theme }) => ({
  backgroundColor: theme.palette.white,
  border: "none",
  padding: `${theme.spacing(1.5)} ${theme.spacing(2)}`,
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",

  "&:hover": {
    [theme.breakpoints.up("md")]: {
      background: theme.palette.gray[10],
    },
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

export const ConfigPanel: FunctionComponent<ConfigPanelProps> = ({
  possibleEventTypes,
  selectedEventTypes,
  setSelectedEventTypes,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const toggleEventType = (data: string) => {
    setSelectedEventTypes((prev) => {
      if (prev.includes(data)) {
        return prev.filter((eventType) => eventType !== data).sort();
      }
      return [...prev, data];
    });
  };

  const toggleSelectAllEventTypes = () => {
    if (possibleEventTypes.length === selectedEventTypes.length) {
      setSelectedEventTypes([]);
    } else {
      setSelectedEventTypes(possibleEventTypes.sort());
    }
  };

  const popoverId = anchorEl ? "timeline-config-popover" : undefined;

  const allItemsSelected =
    possibleEventTypes.length === selectedEventTypes.length;

  const ListItems = (
    <>
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
        <ListItemText primary={allItemsSelected ? "Clear All" : "Select All"} />
      </MenuItem>
    </>
  );

  return (
    <>
      <Paper
        sx={({ palette }) => ({
          backgroundColor: palette.white,
          alignSelf: "flex-start",
          minWidth: 170,
          zIndex: 1,
          mt: 2,
          mx: { xs: 2, sm: 0 },
        })}
      >
        <Typography fontWeight="bold" px={2} pt={1.5} mb={1.75}>
          Events
        </Typography>
        <Box
          component="ul"
          sx={{
            px: 2,
            columnCount: { xs: 2, sm: "unset" },
            mb: { xs: 2, sm: 0 },
          }}
        >
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
          {selectedEventTypes.length === 0 && (
            <Typography
              variant="microText"
              mb={2}
              sx={({ palette }) => ({ color: palette.gray[70] })}
            >
              No events selected
            </Typography>
          )}
        </Box>
        <Divider />

        <FilterBtn
          aria-describedby={popoverId}
          onClick={(evt) =>
            setAnchorEl((prev) => (prev ? null : evt.currentTarget))
          }
        >
          <Typography>
            {`${anchorEl && isMobile ? "Hide events" : "Filter events"} `}
          </Typography>
          <ChevronDownIcon
            sx={{
              ...(!!anchorEl &&
                isMobile && {
                  transform: "rotate(180deg)",
                }),
            }}
          />
        </FilterBtn>
      </Paper>
      {isMobile ? (
        <Collapse in={Boolean(anchorEl)}>
          <MenuList
            sx={({ palette }) => ({
              backgroundColor: palette.white,
              mx: { xs: 2, sm: 0 },
            })}
          >
            {ListItems}
          </MenuList>
        </Collapse>
      ) : (
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
          {ListItems}
        </Menu>
      )}
    </>
  );
};
