import {
  Fade,
  Box,
  Tooltip,
  styled,
  Switch,
  Radio,
  Checkbox,
  Stack,
  InputAdornment,
} from "@mui/material";
import { FC, useEffect, useState } from "react";
import {
  faEnvelope,
  faQuestionCircle,
} from "@fortawesome/free-solid-svg-icons";
import { SIDEBAR_WIDTH } from "../../theme/components/navigation/MuiDrawerThemeOptions";

import { FontAwesomeIcon, SidebarToggleIcon } from "../icons";
import { HEADER_HEIGHT } from "./PageHeader/PageHeader";
import { PageSidebar } from "./PageSidebar/PageSidebar";
import { useSidebarContext } from "./SidebarContext";
import { IconButton } from "../IconButton";
import { TextField } from "../TextField";

const Main = styled("main", {
  shouldForwardProp: (prop) => prop !== "sidebarOpen",
})<{
  sidebarOpen?: boolean;
}>(({ theme, sidebarOpen }) => ({
  height: `calc(100vh - ${HEADER_HEIGHT}px)`,
  overflowY: "auto",
  flexGrow: 1,
  padding: "60px 120px 0 120px",
  transition: theme.transitions.create("margin", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  marginLeft: `-${SIDEBAR_WIDTH}px`,
  ...(sidebarOpen && {
    transition: theme.transitions.create("margin", {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen,
    }),
    marginLeft: 0,
  }),
}));

export const MainContentWrapper: FC = ({ children }) => {
  const { openSidebar, sidebarOpen } = useSidebarContext();
  const [open, setOpen] = useState(" ");

  useEffect(() => {
    setTimeout(() => {
      setOpen("Some random stuff");
      setTimeout(() => {
        setOpen(" ");
      }, 2000);
    }, 2000);
  }, []);

  return (
    <Box
      sx={{
        display: "flex",
        position: "relative",
      }}
    >
      <PageSidebar />
      <Fade in={!sidebarOpen}>
        <Tooltip title="Expand Sidebar">
          <IconButton
            size="large"
            sx={{
              position: "absolute",
              top: "8px",
              left: 32,
              transform: "rotate(180deg)",

              "&:hover": {
                backgroundColor: ({ palette }) => palette.gray[10],
                color: ({ palette }) => palette.gray[50],
              },
            }}
            onClick={openSidebar}
          >
            <SidebarToggleIcon />
          </IconButton>
        </Tooltip>
      </Fade>
      <Main sidebarOpen={sidebarOpen}>
        {children}
        <br />
        <br />
        <Switch />
        <br />
        <Switch size="small" />
        <br />
        <Radio sx={{ mr: 2 }} name="btn" value="a" />
        <Radio name="btn" value="b" />
        <br />
        <Checkbox sx={{ mr: 2 }} />
        <Checkbox checked />
        <br />
        <br />
        <TextField placeholder="Search for anything" helperText={open} />
        <br />
        <Stack direction="row" alignItems="center" spacing={2}>
          <TextField
            defaultValue="small"
            placeholder="Search for anything"
            size="small"
          />
          <TextField
            defaultValue="medium"
            placeholder="Search for anything"
            size="medium"
          />
          <TextField
            defaultValue="large"
            placeholder="Search for anything"
            size="large"
          />
        </Stack>
        <br />
        <Stack direction="row" alignItems="center" spacing={2}>
          <TextField placeholder="Search for anything" error />
          <TextField
            defaultValue="Error Value"
            placeholder="Search for anything"
            error
          />
          <TextField
            defaultValue="large"
            placeholder="Search for anything"
            size="large"
          />
        </Stack>
        <br />
        <Stack direction="row" alignItems="center" spacing={2}>
          <TextField
            placeholder="Search for anything"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <FontAwesomeIcon icon={faEnvelope} />
                </InputAdornment>
              ),
            }}
          />

          <TextField
            placeholder="Search for anything"
            error
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <FontAwesomeIcon icon={faQuestionCircle} />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            placeholder="Search for anything"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Box>https://</Box>
                </InputAdornment>
              ),
            }}
          />
        </Stack>
      </Main>
    </Box>
  );
};
