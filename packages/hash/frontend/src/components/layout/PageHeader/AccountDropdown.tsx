import { useMemo, useRef, useState, VoidFunctionComponent } from "react";
import {
  Box,
  Typography,
  Divider,
  ListItemButton,
  Tooltip,
} from "@mui/material";

import { UserFieldsFragment } from "../../../graphql/apiTypes.gen";
import { Popover } from "../../Popover";
import { Link } from "../../Link";
import { Avatar } from "../../Avatar";
import { HeaderIconButton } from "./HeaderIconButton";

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
  const buttonRef = useRef(null);

  const [open, setOpen] = useState(false);

  const id = open ? "account-popover" : undefined;

  const userPrimaryEmail = useMemo(() => {
    const primaryEmail = user.properties.emails.find((email) => email.primary);

    return primaryEmail?.address;
  }, [user]);

  return (
    <Box>
      <Tooltip
        componentsProps={{ tooltip: { sx: { p: 1.5 } } }}
        title={
          <>
            <Typography
              variant="smallTextLabels"
              sx={{
                fontWeight: 500,
              }}
              mb={0.5}
            >
              <strong>{user.properties.preferredName}</strong>
            </Typography>
            {userPrimaryEmail && (
              <Typography
                component="p"
                variant="microText"
                sx={({ palette }) => ({ color: palette.common.white })}
              >
                {userPrimaryEmail}
              </Typography>
            )}
          </>
        }
        placement="bottom"
      >
        <HeaderIconButton
          onClick={() => setOpen(!open)}
          ref={buttonRef}
          rounded
          sx={{
            height: 32,
            width: 32,
            padding: 0,
          }}
          open={open}
        >
          {avatar ? (
            <Box
              component="img"
              alt="avatar"
              src={avatar}
              sx={{ height: "32px", width: "32px", borderRadius: "100%" }}
            />
          ) : (
            <Avatar size={32} title={user?.properties.preferredName ?? "U"} />
          )}
        </HeaderIconButton>
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
          sx: ({ palette }) => ({
            width: 225,
            borderRadius: "6px",
            marginTop: 1,
            border: `1px solid ${palette.gray["20"]}`,
          }),
        }}
        sx={({ palette }) => ({
          color: palette.gray[40],
        })}
      >
        <Box px={2} pt={1} pb={1.5}>
          <Typography
            variant="smallTextLabels"
            sx={({ palette }) => ({
              color: palette.gray[80],
              fontWeight: 700,
            })}
          >
            {user.properties.preferredName}
          </Typography>
          {userPrimaryEmail && (
            <Typography
              component="p"
              variant="microText"
              sx={({ palette }) => ({ color: palette.gray[60], lineHeight: 1 })}
            >
              {userPrimaryEmail}
            </Typography>
          )}
        </Box>
        <Divider sx={({ palette }) => ({ borderColor: palette.gray[30] })} />
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
          <Divider sx={({ palette }) => ({ borderColor: palette.gray[30] })} />
          <ListItemButton
            sx={{
              m: 0.5,
              borderRadius: 0.5,
            }}
            onClick={logout}
          >
            <Typography
              variant="smallTextLabels"
              sx={({ palette }) => ({ lineHeight: 1, color: palette.gray[60] })}
            >
              Sign Out
            </Typography>
          </ListItemButton>
        </Box>
      </Popover>
    </Box>
  );
};
