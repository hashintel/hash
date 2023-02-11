import { faSmile, faStar } from "@fortawesome/free-regular-svg-icons";
import {
  faChevronRight,
  faGear,
  faPerson,
} from "@fortawesome/free-solid-svg-icons";
import {
  Avatar,
  Chip,
  FontAwesomeIcon,
  MenuCheckboxItem,
  Select,
} from "@hashintel/design-system";
import {
  Box,
  FormControl,
  ListItemAvatar,
  ListItemIcon,
  ListItemSecondaryAction,
  ListItemText,
  MenuList,
  Stack,
} from "@mui/material";

import { MenuItem } from "../../shared/ui";
import { SelectWithSearch } from "./select/select-with-search";
import { SelectWithSearchAndCheckbox } from "./select/select-with-search-checkbox";

export const SelectMenusDemo = () => {
  return (
    <Box>
      {/* Sizes */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        mb={2}
        sx={{
          "& > *": {
            minWidth: 300,
          },
        }}
      >
        <Select size="small" value="10">
          <MenuItem value="10">Tom Cook</MenuItem>
        </Select>
        <Select size="medium" value="10">
          <MenuItem value="10">Tom Cook</MenuItem>
        </Select>
        <Select size="large" value="10">
          <MenuItem value="10">Tom Cook</MenuItem>
        </Select>
      </Stack>
      {/* Triggers */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        mb={2}
        sx={{
          "& > *": {
            minWidth: 300,
          },
        }}
      >
        <Select value="10">
          <MenuItem value="10">
            <ListItemIcon>
              <FontAwesomeIcon icon={faStar} />
            </ListItemIcon>
            <ListItemText primary="Tom Cook" />
            <ListItemSecondaryAction>@tomcook</ListItemSecondaryAction>
          </MenuItem>
          <MenuItem value="20">
            <ListItemIcon>
              <FontAwesomeIcon icon={faStar} />
            </ListItemIcon>
            <ListItemText primary="Tom Cook" />
            <ListItemSecondaryAction>@tomcook</ListItemSecondaryAction>
          </MenuItem>
        </Select>

        <Select value="10">
          <MenuItem value="10">
            <ListItemText primary="Tom Cook" />
            <ListItemSecondaryAction>@tomcook</ListItemSecondaryAction>
          </MenuItem>
          <MenuItem value="20">
            <ListItemText primary="Tom Cook" />
            <ListItemSecondaryAction>@tomcook</ListItemSecondaryAction>
          </MenuItem>
        </Select>
        <Select value="10">
          <MenuItem value="10">
            <ListItemAvatar>
              <Avatar src="https://picsum.photos/id/237/100/100" />
            </ListItemAvatar>
            <ListItemText primary="Tom Cook" />
          </MenuItem>
          <MenuItem value="20">
            <ListItemAvatar>
              <Avatar src="https://picsum.photos/id/233/100/100" />
            </ListItemAvatar>
            <ListItemText primary="Tom Cook" />
          </MenuItem>
        </Select>
      </Stack>
      <Box mb={3} />
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        mb={2}
        sx={{
          "& > *": {
            minWidth: 300,
          },
        }}
      >
        <Select value="10">
          <MenuItem value="10">
            <ListItemIcon>
              <FontAwesomeIcon icon={faStar} />
            </ListItemIcon>
            <ListItemText primary="Tom Cook" />
            <ListItemSecondaryAction>@tomcook</ListItemSecondaryAction>
          </MenuItem>
          <MenuItem value="20">
            <ListItemIcon>
              <FontAwesomeIcon icon={faStar} />
            </ListItemIcon>
            <ListItemText primary="Tom Cook" />
            <ListItemSecondaryAction>@tomcook</ListItemSecondaryAction>
          </MenuItem>
        </Select>
      </Stack>
      {/* Chips */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        mb={2}
        sx={{
          "& > *": {
            minWidth: 300,
          },
        }}
      >
        <Select
          multiple
          renderValue={(selected) => (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {selected.map((value) => (
                <Chip key={value} label={value} size="xs" color="blue" />
              ))}
            </Box>
          )}
          defaultValue={["Multiple"]}
        >
          {["Multiple", "values", "in", "chips"].map((item) => (
            <MenuCheckboxItem key={item} value={item}>
              <ListItemText primary={item} />
            </MenuCheckboxItem>
          ))}
        </Select>
        <Select
          multiple
          renderValue={(selected) => (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {selected.map((value) => (
                <Chip key={value} label={value} size="xs" color="red" />
              ))}
            </Box>
          )}
          defaultValue={["Multiple", "values"]}
        >
          {["Multiple", "values", "in", "chips"].map((item) => (
            <MenuCheckboxItem key={item} value={item}>
              <ListItemText primary={item} />
            </MenuCheckboxItem>
          ))}
        </Select>
        {/*  */}
      </Stack>
      {/*  */}
      {/* DROP-DOWNS */}
      <br />
      <br />
      <br />
      {/* SIZES */}

      <Stack
        direction="row"
        alignItems="center"
        spacing={4}
        mb={2}
        sx={{
          "& > *": {
            minWidth: 250,
            // border: "1px dotted black"
          },
        }}
      >
        {/*  */}
        <MenuList>
          <MenuItem value="10" selected>
            <ListItemText primary="Account Settings" />
          </MenuItem>
          <MenuItem value="20">
            <ListItemText primary="Account Settings" />
          </MenuItem>
          <MenuItem value="30">
            <ListItemText primary="Account Settings" />
          </MenuItem>
        </MenuList>
        {/*  */}
        <MenuList>
          <MenuItem value="10">
            <ListItemIcon>
              <FontAwesomeIcon icon={faSmile} />
            </ListItemIcon>
            <ListItemText primary="Edit" />
          </MenuItem>
          <MenuItem value="20" selected>
            <ListItemIcon>
              <FontAwesomeIcon icon={faSmile} />
            </ListItemIcon>
            <ListItemText primary="Edit" />
          </MenuItem>
          <MenuItem value="30">
            <ListItemIcon>
              <FontAwesomeIcon icon={faSmile} />
            </ListItemIcon>
            <ListItemText primary="Edit" />
          </MenuItem>
        </MenuList>
        {/*  */}
        <MenuList>
          <MenuItem value="10">
            <ListItemIcon>
              <FontAwesomeIcon icon={faSmile} />
            </ListItemIcon>
            <ListItemText primary="Edit" />
            <ListItemSecondaryAction>
              <FontAwesomeIcon icon={faChevronRight} />
            </ListItemSecondaryAction>
          </MenuItem>
          <MenuItem value="20">
            <ListItemIcon>
              <FontAwesomeIcon icon={faSmile} />
            </ListItemIcon>
            <ListItemText primary="Edit" />
            <ListItemSecondaryAction>
              <FontAwesomeIcon icon={faChevronRight} />
            </ListItemSecondaryAction>
          </MenuItem>
          <MenuItem value="30" selected>
            <ListItemIcon>
              <FontAwesomeIcon icon={faSmile} />
            </ListItemIcon>
            <ListItemText primary="Edit" />
            <ListItemSecondaryAction>
              <FontAwesomeIcon icon={faChevronRight} />
            </ListItemSecondaryAction>
          </MenuItem>
        </MenuList>
        {/*  */}
        <MenuList>
          <MenuItem value="10">
            <ListItemAvatar>
              <Avatar src="https://picsum.photos/id/200/100/100" />
            </ListItemAvatar>
            <ListItemText primary="Mark Marrignton" />
            <ListItemSecondaryAction>
              <FontAwesomeIcon icon={faChevronRight} />
            </ListItemSecondaryAction>
          </MenuItem>
          <MenuItem value="20">
            <ListItemAvatar>
              <Avatar src="https://picsum.photos/id/200/100/100" />
            </ListItemAvatar>
            <ListItemText primary="Mark Marrignton" />
            <ListItemSecondaryAction>
              <FontAwesomeIcon icon={faChevronRight} />
            </ListItemSecondaryAction>
          </MenuItem>
          <MenuItem value="30" selected>
            <ListItemAvatar>
              <Avatar src="https://picsum.photos/id/200/100/100" />
            </ListItemAvatar>
            <ListItemText primary="Mark Marrignton" />
            <ListItemSecondaryAction>
              <FontAwesomeIcon icon={faChevronRight} />
            </ListItemSecondaryAction>
          </MenuItem>
        </MenuList>
      </Stack>
      {/* VARIANTS */}

      <Box mb={8} />

      <Stack
        direction="row"
        alignItems="center"
        spacing={4}
        mb={2}
        sx={{
          "& > *": {
            minWidth: 250,
            // border: "1px dotted black"
          },
        }}
      >
        <MenuList>
          <MenuItem value="10" selected>
            <ListItemText primary="Account Settings" />
            <ListItemSecondaryAction>Cmd + D</ListItemSecondaryAction>
          </MenuItem>
          <MenuItem value="20">
            <ListItemText primary="Account Settings" />
            <ListItemSecondaryAction>Cmd + D</ListItemSecondaryAction>
          </MenuItem>
          <MenuItem value="30">
            <ListItemText primary="Account Settings" />
            <ListItemSecondaryAction>Cmd + D</ListItemSecondaryAction>
          </MenuItem>
        </MenuList>
        {/*  */}
        <MenuList>
          <MenuItem value="10">
            <ListItemIcon>
              <FontAwesomeIcon icon={faSmile} />
            </ListItemIcon>
            <ListItemText primary="Account Settings" />
            <ListItemSecondaryAction>Cmd + D</ListItemSecondaryAction>
          </MenuItem>
          <MenuItem value="20" selected>
            <ListItemIcon>
              <FontAwesomeIcon icon={faSmile} />
            </ListItemIcon>
            <ListItemText primary="Account Settings" />
            <ListItemSecondaryAction>Cmd + D</ListItemSecondaryAction>
          </MenuItem>
          <MenuItem value="30">
            <ListItemIcon>
              <FontAwesomeIcon icon={faSmile} />
            </ListItemIcon>
            <ListItemText primary="Account Settings" />
            <ListItemSecondaryAction>Cmd + D</ListItemSecondaryAction>
          </MenuItem>
        </MenuList>
        {/*  */}
        <MenuList>
          <MenuItem value="10">
            <ListItemText
              primary="Account Settings"
              secondary="Descriptive text"
            />
          </MenuItem>
          <MenuItem value="20">
            <ListItemText
              primary="Account Settings"
              secondary="Descriptive text"
            />
          </MenuItem>
          <MenuItem value="30" selected>
            <ListItemText
              primary="Account Settings"
              secondary="Descriptive text"
            />
          </MenuItem>
        </MenuList>
        {/*  */}
        <MenuList>
          <MenuItem value="10">
            <ListItemIcon>
              <FontAwesomeIcon icon={faGear} />
            </ListItemIcon>
            <ListItemText
              primary="Account Settings"
              secondary="Descriptive text"
            />
          </MenuItem>
          <MenuItem value="20">
            <ListItemIcon>
              <FontAwesomeIcon icon={faGear} />
            </ListItemIcon>
            <ListItemText
              primary="Account Settings"
              secondary="Descriptive text"
            />
          </MenuItem>
          <MenuItem value="30" selected>
            <ListItemIcon>
              <FontAwesomeIcon icon={faGear} />
            </ListItemIcon>
            <ListItemText
              primary="Account Settings"
              secondary="Descriptive text"
            />
          </MenuItem>
        </MenuList>
      </Stack>
      {/*  */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={4}
        mb={2}
        sx={{
          "& > *": {
            minWidth: 250,
          },
        }}
      >
        <MenuList>
          <MenuCheckboxItem value="10">
            <ListItemText primary="Account Settings" />
          </MenuCheckboxItem>
          <MenuCheckboxItem value="20">
            <ListItemText primary="Account Settings" />
          </MenuCheckboxItem>
          <MenuCheckboxItem value="30">
            <ListItemText primary="Account Settings" />
          </MenuCheckboxItem>
        </MenuList>
        {/*  */}
        <MenuList>
          <MenuCheckboxItem value="10">
            <ListItemIcon>
              <FontAwesomeIcon icon={faPerson} />
            </ListItemIcon>
            <ListItemText primary="Account Settings" />
          </MenuCheckboxItem>
          <MenuCheckboxItem value="20">
            <ListItemIcon>
              <FontAwesomeIcon icon={faPerson} />
            </ListItemIcon>
            <ListItemText primary="Account Settings" />
          </MenuCheckboxItem>
          <MenuCheckboxItem value="30">
            <ListItemIcon>
              <FontAwesomeIcon icon={faPerson} />
            </ListItemIcon>
            <ListItemText primary="Account Settings" />
          </MenuCheckboxItem>
        </MenuList>
      </Stack>
      <Box mb={6} />
      {/*  */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={4}
        mb={2}
        sx={{
          "& > *": {
            minWidth: 250,
          },
        }}
      >
        <FormControl>
          <Select
            label="Select type"
            value="10"
            error
            helperText="Please select a type to continue"
          >
            <MenuItem value="10">Tom Cook</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      <Box mb={6} />
      <Stack
        direction="row"
        alignItems="flex-end"
        spacing={4}
        mb={2}
        sx={{
          "& > *": {
            width: 250,
          },
        }}
      >
        <SelectWithSearch />
        <SelectWithSearchAndCheckbox />
      </Stack>
    </Box>
  );
};
