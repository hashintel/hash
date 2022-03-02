import { VFC, useState, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeSvgIcon } from "../../icons";
import { Popover } from "../../Popover";
import { Link } from "../../Link";
import { useUser } from "../../hooks/useUser";

type WorkspaceSwitcherProps = {};

const truncateText = (text: string) => {
  if (text.length > 18) {
    return `${text.slice(0, 15)}...`;
  }
  return text;
};

export const WorkspaceSwitcher: VFC<WorkspaceSwitcherProps> = () => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { user } = useUser();

  console.log("user ==> ", user);

  //   @todo make this a button
  return (
    <Box>
      <Box
        onClick={() => setOpen(true)}
        ref={buttonRef}
        sx={{
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          padding: "12px 16px 12px 18px",
          cursor: "pointer",
          "&:hover": {
            backgroundColor: ({ palette }) => palette.gray[20],
          },
        }}
      >
        <Box
          sx={{
            height: 24,
            width: 24,
            borderRadius: "50%",
            backgroundColor: ({ palette }) => palette.blue[70],
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Typography
            variant="smallTextLabels"
            sx={{ color: ({ palette }) => palette.common.white, lineHeight: 1 }}
          >
            M
          </Typography>
        </Box>
        <Typography
          sx={{
            pr: 1,
            pl: 1,
            overflowX: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            color: ({ palette }) => palette.gray[80],
            fontWeight: 600,
          }}
          variant="smallTextLabels"
        >
          {truncateText(user?.properties.preferredName ?? "User")}
        </Typography>
        <FontAwesomeSvgIcon icon={faChevronDown} sx={{ fontSize: 12 }} />
      </Box>
      <Popover
        open={open}
        anchorEl={buttonRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        PaperProps={{
          elevation: 4,
          sx: {
            width: 269,
            borderRadius: "6px",
            mt: 0.5,
            minHeight: 180, // @todo remove
          },
        }}
      >
        <Box
          sx={{
            py: 0.25,
          }}
        >
          <Link
            href="/"
            noLinkStyle
            sx={{
              display: "flex",
            }}
          >
            {/* @todo create a UserAvatar component */}
            <Box
              sx={{
                height: 38,
                width: 38,
                borderRadius: "50%",
                mr: 0.75,
              }}
            >
              {/*  */}
            </Box>
            <Box>
              <Typography>My personal workspace</Typography>
              <Typography>1 member</Typography>
            </Box>
          </Link>
          {user?.memberOf.map(({ org }) => (
            // eslint-disable-next-line react/jsx-key
            <Link
              href={`/${org.accountId}`}
              noLinkStyle
              key={org.accountId}
              sx={{
                display: "flex",
              }}
            >
              {/* @todo create a UserAvatar component */}
              <Box
                sx={{
                  height: 38,
                  width: 38,
                  borderRadius: "50%",
                  mr: 0.75,
                }}
              >
                {/*  */}
              </Box>
              <Box>
                <Typography>{org.properties.name}</Typography>
                <Typography>{`${org.memberships.length} members`}</Typography>
              </Box>
            </Link>
          ))}

          <Box>Workspace settings</Box>
          <Box>Create or join workspace</Box>
          <Box>
            <Typography>Sign out</Typography>
          </Box>
        </Box>
      </Popover>
    </Box>
  );
};
