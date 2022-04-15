import { faStar, faSmile } from "@fortawesome/free-regular-svg-icons";
import {
  faChevronRight,
  faGear,
  faPerson,
} from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  Checkbox,
  Chip,
  ListItemAvatar,
  ListItemIcon,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  MenuList,
  Select,
  Stack,
} from "@mui/material";
import { FontAwesomeIcon } from "../../shared/icons";
import { Avatar, Button, TextField } from "../../shared/ui";

export const SelectMenus = () => {
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
      {/* Using TextField instead  */}
      {/* <Stack
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
        <TextField
          select
          value="10"
          SelectProps={{
            value: "10",
          }}
        >
          <MenuItem value="10">Tom Cooka</MenuItem>
        </TextField>
        <TextField
          select
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <FontAwesomeIcon icon={faStar} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <Typography sx={({ palette }) => ({ color: palette.gray[50] })}>
                  @tomcook
                </Typography>
              </InputAdornment>
            ),
          }}
        >
          <MenuItem value="10">Tom Cook</MenuItem>
        </TextField>
      </Stack> */}
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
        {/* @todo add styles for chips */}
        <Select
          multiple
          renderValue={(selected) => (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {selected.map((value) => (
                <Chip key={value} label={value} />
              ))}
            </Box>
          )}
          value={["10", "20", "30", "40"]}
        >
          <MenuItem value="10">Multiple</MenuItem>
          <MenuItem value="20">Values</MenuItem>
          <MenuItem value="30">In</MenuItem>
          <MenuItem value="40">Chips</MenuItem>
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
            // border: "1px dotted black"
          },
        }}
      >
        <MenuList>
          <MenuItem value="10">
            <ListItemIcon>
              <Checkbox />
            </ListItemIcon>
            <ListItemText primary="Account Settings" />
          </MenuItem>
          <MenuItem value="20">
            <ListItemIcon>
              <Checkbox />
            </ListItemIcon>
            <ListItemText primary="Account Settings" />
          </MenuItem>
          <MenuItem value="30">
            <ListItemIcon>
              <Checkbox />
            </ListItemIcon>
            <ListItemText primary="Account Settings" />
          </MenuItem>
        </MenuList>
        {/*  */}
        <MenuList>
          <MenuItem value="10">
            <ListItemIcon>
              <Checkbox />
            </ListItemIcon>
            <ListItemIcon>
              <FontAwesomeIcon icon={faPerson} />
            </ListItemIcon>
            <ListItemText primary="Account Settings" />
          </MenuItem>
          <MenuItem value="20">
            <ListItemIcon>
              <Checkbox />
            </ListItemIcon>
            <ListItemIcon>
              <FontAwesomeIcon icon={faPerson} />
            </ListItemIcon>
            <ListItemText primary="Account Settings" />
          </MenuItem>
          <MenuItem value="30">
            <ListItemIcon>
              <Checkbox />
            </ListItemIcon>
            <ListItemIcon>
              <FontAwesomeIcon icon={faPerson} />
            </ListItemIcon>
            <ListItemText primary="Account Settings" />
          </MenuItem>
        </MenuList>
      </Stack>
    </Box>
  );
};
