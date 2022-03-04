import { useRef, useState, VoidFunctionComponent } from "react";
import { tw } from "twind";
import {
  Box,
  Typography,
  Divider,
  ListItemButton,
  Button,
  useTheme,
} from "@mui/material";

import { UserFieldsFragment } from "../../../graphql/apiTypes.gen";
import { Popover } from "../../Popover";
import { Link } from "../../Link";

type AccountDropdownProps = {
  avatar?: string;
  logout: () => void;
  user: UserFieldsFragment;
};

export const AccountDropdown: VoidFunctionComponent<AccountDropdownProps> = ({
  avatar,
  logout,
  user,
}) => {
  const theme = useTheme();

  const buttonRef = useRef(null);

  const [open, setOpen] = useState(false);

  const id = open ? "account-popover" : undefined;

  return (
    <Box>
      <Button
        variant="transparent"
        onClick={() => setOpen(!open)}
        className="flex items-center relative m-auto focus:outline-none"
        ref={buttonRef}
        sx={{
          borderRadius: "100%",
          boxShadow: open
            ? "0px 0px 0px 2px #FFFFFF, 0px 0px 0px 5px #C1CFDE"
            : "unset",
          ":hover": {
            boxShadow: "0px 0px 0px 2px #FFFFFF, 0px 0px 0px 5px #C1CFDE",
          },
        }}
        title={user.properties.shortname!}
      >
        {avatar ? (
          <Box
            component="img"
            alt="avatar"
            src={avatar}
            sx={{ height: "32px", width: "32px", borderRadius: "100%" }}
            className={tw`border border(solid gray-200)`}
          />
        ) : (
          <Box
            sx={{
              height: "32px",
              width: "32px",
              borderRadius: "100%",
              color: theme.palette.common.white,
              background: theme.palette.blue[70],
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {user.properties.preferredName![0].toUpperCase()}
          </Box>
        )}
      </Button>
      <Popover
        id={id}
        open={open}
        anchorEl={buttonRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        PaperProps={{
          elevation: 4,
          sx: {
            width: 225,
            borderRadius: "6px",
            marginTop: 1,
            border: `1px solid ${theme.palette.gray["20"]}`,
          },
        }}
        sx={{
          ".MuiListItemButton-root": {
            color: theme.palette.gray[80],
            ".MuiTypography-smallTextParagraphs": {
              fontWeight: 500,
              lineHeight: "18px",
            },
            ".MuiTypography-microText": {
              fontWeight: 500,
              lineHeight: "18px",
              color: theme.palette.gray[50],
            },
          },
          ".MuiListItemButton-root:hover": {
            ".MuiTypography-smallTextParagraphs": {
              color: theme.palette.gray[90],
            },
          },
        }}
      >
        <Box px={2} pt={1} pb={1.5}>
          <Typography
            variant="smallTextParagraphs"
            sx={{
              color: theme.palette.gray[80],
              fontWeight: 500,
              lineHeight: "18px",
            }}
          >
            <strong>{user.properties.preferredName}</strong>
          </Typography>
          <Typography
            component="p"
            variant="microText"
            sx={{ color: theme.palette.gray[70], lineHeight: "18px" }}
          >
            @{user.properties.shortname!}
          </Typography>
        </Box>
        <Divider />
        <Box>
          <Link noLinkStyle href="#" onClick={() => setOpen(false)}>
            <ListItemButton
              sx={{
                padding: theme.spacing(1, 2),
                m: 0.5,
                borderRadius: 1,
              }}
            >
              <Typography variant="smallTextParagraphs" sx={{ lineHeight: 1 }}>
                Account Settings
              </Typography>
            </ListItemButton>
          </Link>
          <Divider />
          <ListItemButton
            sx={{
              padding: theme.spacing(1, 2),
              m: 0.5,
              borderRadius: 0.5,
            }}
            onClick={logout}
          >
            <Typography
              variant="smallTextParagraphs"
              sx={{ lineHeight: 1, color: theme.palette.gray[60] }}
            >
              Log Out
            </Typography>
          </ListItemButton>
        </Box>
      </Popover>
    </Box>
  );
};
