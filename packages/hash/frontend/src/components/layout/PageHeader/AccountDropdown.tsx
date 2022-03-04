import { useRef, useState, VoidFunctionComponent } from "react";
import { tw } from "twind";
import {
  Box,
  Typography,
  Divider,
  ListItemButton,
  useTheme,
  Tooltip,
  IconButton,
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
      <Tooltip
        title={
          <Box p={1.5}>
            <Typography
              variant="smallTextLabels"
              sx={{
                fontWeight: 500,
              }}
              mb={0.5}
            >
              <strong>{user.properties.preferredName}</strong>
            </Typography>
            <Typography
              component="p"
              variant="microText"
              sx={{ color: theme.palette.common.white }}
            >
              @{user.properties.shortname!}
            </Typography>
          </Box>
        }
        placement="bottom"
      >
        <IconButton
          onClick={() => setOpen(!open)}
          className="flex items-center relative m-auto focus:outline-none"
          ref={buttonRef}
          sx={{
            height: 32,
            width: 32,
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
                background: theme.palette.blue[70],
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography sx={{ color: theme.palette.common.white }}>
                {user.properties.preferredName![0].toUpperCase()}
              </Typography>
            </Box>
          )}
        </IconButton>
      </Tooltip>
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
          color: theme.palette.gray[40],
        }}
      >
        <Box px={2} pb={1} pt={1.5}>
          <Typography
            variant="smallTextLabels"
            sx={{
              color: theme.palette.gray[80],
              fontWeight: 700,
            }}
            mb={0.25}
          >
            {user.properties.preferredName}
          </Typography>
          <Typography
            component="p"
            variant="microText"
            sx={{ color: theme.palette.gray[60], lineHeight: 1 }}
          >
            @{user.properties.shortname!}
          </Typography>
        </Box>
        <Divider sx={{ borderColor: theme.palette.gray[30] }} />
        <Box>
          <Link noLinkStyle href="#" onClick={() => setOpen(false)}>
            <ListItemButton
              sx={{
                m: 0.5,
                borderRadius: 1,
              }}
            >
              <Typography variant="smallTextLabels" sx={{ lineHeight: 1 }}>
                Account Settings
              </Typography>
            </ListItemButton>
          </Link>
          <Divider sx={{ borderColor: theme.palette.gray[30] }} />
          <ListItemButton
            sx={{
              m: 0.5,
              borderRadius: 0.5,
            }}
            onClick={logout}
          >
            <Typography
              variant="smallTextLabels"
              sx={{ lineHeight: 1, color: theme.palette.gray[60] }}
            >
              Sign Out
            </Typography>
          </ListItemButton>
        </Box>
      </Popover>
    </Box>
  );
};
