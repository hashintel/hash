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
  Typography,
} from "@mui/material";
import { FC, useEffect, useState } from "react";
import {
  faEnvelope,
  faQuestionCircle,
} from "@fortawesome/free-solid-svg-icons";

import { FontAwesomeIcon, SidebarToggleIcon } from "../../shared/icons";
import { HEADER_HEIGHT } from "./PageHeader/PageHeader";
import { PageSidebar, SIDEBAR_WIDTH } from "./PageSidebar/PageSidebar";
import { useSidebarContext } from "./SidebarContext";
import { Button, IconButton, TextField, FormInline } from "../../shared/ui";

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
            defaultValue="password1"
            placeholder="Search for anything"
            error
          />
          <TextField
            placeholder="Search for anything"
            defaultValue="name@email.com"
            size="large"
            success
          />
        </Stack>
        <br />
        <Stack direction="row" alignItems="center" spacing={2}>
          <TextField
            defaultValue="password1"
            placeholder="Search for anything"
            error
            helperText="Your password must be less than 4 characters."
          />
          <TextField
            defaultValue="password1"
            placeholder="Search for anything"
            helperText="Make your password short and easy to guess"
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
                <InputAdornment
                  sx={({ palette }) => ({
                    backgroundColor: palette.gray[10],
                    color: palette.gray[60],
                    paddingRight: "12px",
                    border: `1px solid ${palette.gray[30]}`,
                  })}
                  position="start"
                >
                  <Typography
                    sx={({ palette }) => ({
                      color: palette.gray[60],
                    })}
                    variant="regularTextLabels"
                  >
                    https://
                  </Typography>
                </InputAdornment>
              ),
            }}
          />
        </Stack>
        <br />
        <Stack direction="row" alignItems="flex-start" spacing={2}>
          <TextField
            label="Password"
            helperText="Make your password is short and easy to guess"
            required
            showLabelCornerHint
          />
          <TextField
            label="Email"
            placeholder="you@example.com"
            showLabelCornerHint
          />
          <TextField
            label="Todo item"
            defaultValue="my thing"
            placeholder="you@example.com"
          />
        </Stack>
        <br />
        <Stack direction="row" alignItems="flex-start" spacing={2}>
          <TextField placeholder="Something about myself" multiline />
          <TextField
            defaultValue="Something about myself"
            multiline
            autoResize
          />
        </Stack>
        <br />
        <Stack direction="row" alignItems="flex-start" spacing={2}>
          <FormInline>
            <TextField defaultValue="start typing" />
            <Button>Submit</Button>
          </FormInline>
        </Stack>

        <br />
        <br />
        <br />
        <br />
      </Main>
    </Box>
  );
};
