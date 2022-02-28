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

import { AvatarIcon } from "../../icons";
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
        title={user.properties.shortname!}
        className="flex items-center relative z-10 m-auto focus:outline-none"
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
      >
        {avatar ? (
          <Box
            component={"img"}
            alt="avatar"
            src={avatar}
            sx={{ height: "32px", width: "32px", borderRadius: "100%" }}
            className={tw`border border(solid gray-200)`}
          />
        ) : (
          <AvatarIcon
            style={{ height: "32px", width: "32px", borderRadius: "100%" }}
            className={tw`border border(solid gray-200)`}
          />
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
      >
        <Box px={2} pt={1} pb={1.5}>
          <Typography variant="smallCopy">
            <strong>{user.properties.preferredName}</strong>
          </Typography>
          <Typography component="p" variant="microCopy">
            @{user.properties.shortname!}
          </Typography>
        </Box>
        <Divider />
        <Box>
          <Link noLinkStyle href="#" onClick={() => setOpen(false)}>
            <ListItemButton
              sx={{
                padding: (theme) => theme.spacing(1, 2),
                m: 0.5,
                borderRadius: 1,
              }}
            >
              <Typography variant="smallCopy" sx={{ lineHeight: 1 }}>
                Account Settings
              </Typography>
            </ListItemButton>
          </Link>
          <Divider />
          <ListItemButton
            sx={{
              padding: (theme) => theme.spacing(1, 2),
              m: 0.5,
              borderRadius: 0.5,
            }}
            onClick={logout}
          >
            <Typography variant="smallCopy" sx={{ lineHeight: 1 }}>
              Log Out
            </Typography>
          </ListItemButton>
        </Box>
      </Popover>
    </Box>
  );
};
