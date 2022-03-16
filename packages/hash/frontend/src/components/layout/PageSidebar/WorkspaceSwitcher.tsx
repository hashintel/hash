import { VFC, useState, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "../../icons";
import { Popover } from "../../Popover";
import { Link } from "../../Link";
import { useUser } from "../../hooks/useUser";
import { Avatar } from "../../Avatar";
import { useLogout } from "../../hooks/useLogout";

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
  const { logout } = useLogout();

  return (
    <>
      {/* @todo-mui use the Button component for this instead  */}
      <Box
        onClick={() => setOpen(true)}
        ref={buttonRef}
        component="button"
        sx={{
          borderRadius: "4px",
          display: "flex",
          width: "100%",
          textAlign: "left",
          alignItems: "center",
          padding: "12px 16px 12px 18px",
          cursor: "pointer",

          "&:hover": {
            backgroundColor: ({ palette }) => palette.gray[20],
          },

          "&:focus": {
            outlineColor: ({ palette }) => `2px solid ${palette.blue[70]}`,
            outlineOffset: "2px",
          },
        }}
      >
        <Avatar size={24} title={user?.properties.preferredName ?? "U"} />
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
        <FontAwesomeIcon
          icon={faChevronDown}
          sx={{ fontSize: 12, color: ({ palette }) => palette.gray[70] }}
        />
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
        <Box>
          <Box
            sx={{
              pt: 1.25,
              py: 1,
              px: 0.4,
              borderBottom: ({ palette }) => `1px solid ${palette.gray[30]}`,
            }}
          >
            <Link
              href="/"
              noLinkStyle
              sx={{
                display: "flex",
                py: 1,
                px: 1.5,
                borderRadius: "4px",
                //   @todo-mui this is a default style and should be placed in the Link component
                "&:hover": {
                  backgroundColor: ({ palette }) => palette.gray[20],
                },

                "&:focus": {
                  outline: ({ palette }) => `2px solid ${palette.blue[70]}`,
                  outlineOffset: "2px",
                },
              }}
            >
              <Avatar
                size={38}
                title={user?.properties.preferredName ?? "U"}
                sx={{
                  mr: 0.75,
                }}
              />

              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Typography
                  variant="smallTextLabels"
                  sx={{
                    fontWeight: 600,
                    color: ({ palette }) => palette.gray[80],
                    mb: "2px",
                  }}
                >
                  My personal workspace
                </Typography>
                <Typography
                  variant="microText"
                  sx={{
                    color: ({ palette }) => palette.gray[50],
                    fontWeight: 500,
                  }}
                >{`@${user?.properties.shortname ?? "user"}`}</Typography>
              </Box>
            </Link>
            {user?.memberOf.map(({ org }) => (
              <Link
                href={`/${org.accountId}`}
                noLinkStyle
                key={org.accountId}
                sx={{
                  display: "flex",
                  py: 1,
                  px: 1.5,
                  borderRadius: "4px",
                  //   @todo-mui this is a default style and should be placed in the Link component
                  "&:hover": {
                    backgroundColor: ({ palette }) => palette.gray[20],
                  },

                  "&:focus": {
                    outline: ({ palette }) => `2px solid ${palette.blue[70]}`,
                    outlineOffset: "2px",
                  },
                }}
              >
                <Avatar
                  size={38}
                  sx={{
                    mr: 0.75,
                  }}
                  title={org.properties.name}
                />
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Typography
                    variant="smallTextLabels"
                    sx={{
                      mb: "2px",
                    }}
                  >
                    {org.properties.name}
                  </Typography>
                  <Typography
                    variant="microText"
                    sx={{
                      color: ({ palette }) => palette.gray[50],
                      fontWeight: 500,
                    }}
                  >{`${org.memberships.length} members`}</Typography>
                </Box>
              </Link>
            ))}
          </Box>

          <Box
            sx={{
              px: 0.5,
              py: 0.75,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {[
              {
                title: "Workspace Settings",
                id: 1,
                href: "/",
              },
              {
                title: "Create or Join a workspace",
                id: 2,
                href: "/",
              },
            ].map(({ title, id, href }) => (
              <Link
                key={id}
                href={href}
                noLinkStyle
                sx={{
                  px: 1.5,
                  py: 1,
                  borderRadius: "4px",
                  //   @todo-mui this is a default style and should be placed in the Link component
                  "&:hover": {
                    backgroundColor: ({ palette }) => palette.gray[20],
                  },

                  "&:focus": {
                    outline: ({ palette }) => `2px solid ${palette.blue[70]}`,
                    outlineOffset: "2px",
                  },
                }}
              >
                <Typography
                  variant="smallTextLabels"
                  sx={{
                    lineHeight: 1,
                    color: ({ palette }) => palette.gray[80],
                    fontWeight: 500,
                  }}
                >
                  {title}
                </Typography>
              </Link>
            ))}
          </Box>

          <Box
            sx={{
              p: "4px 4px 6px 4px",
              borderTop: ({ palette }) => `1px solid ${palette.gray[30]}`,
            }}
          >
            {/* @todo use the LinkButton for this once merged in */}
            <Box
              component="button"
              sx={{
                px: 1,
                py: 1.5,
                display: "block",
                width: "100%",
                textAlign: "left",
                "&:hover": {
                  backgroundColor: ({ palette }) => palette.gray[20],
                },

                "&:focus": {
                  outline: ({ palette }) => `2px solid ${palette.blue[70]}`,
                  outlineOffset: "2px",
                },
              }}
              onClick={() => logout()}
            >
              <Typography
                sx={{
                  color: ({ palette }) => palette.gray[60],
                }}
              >
                Sign out
              </Typography>
            </Box>
          </Box>
        </Box>
      </Popover>
    </>
  );
};
