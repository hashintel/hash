import { useCallback, useState, useRef } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  IconButton,
  ListItemButton,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useKeys } from "rooks";
import { useRouter } from "next/router";

import { FontAwesomeIcon } from "../../icons";
import { Popover } from "../../Popover";
import { Link } from "../../Link";
import { CreatePageModal } from "../../Modals/CreatePageModal";

export const ActionsDropdown: React.FC<{
  accountId: string;
}> = ({ accountId }) => {
  const router = useRouter();

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const buttonRef = useRef(null);

  const [open, setOpen] = useState(false);

  const id = open ? "actions-popover" : undefined;

  const [createPageOpen, setCreatePageOpen] = useState(false);

  const closeCreatePage = useCallback(() => {
    // Prevent the bug of closing a non-existing modal
    if (createPageOpen) {
      setCreatePageOpen(false);
    }
  }, [createPageOpen]);

  const newEntityTypeRoute = `/${accountId}/types/new`;

  const showCreatePage = () => {
    setCreatePageOpen(true);
    if (open) {
      setOpen(false);
    }
  };

  useKeys(["AltLeft", "KeyP"], showCreatePage);
  useKeys(["AltLeft", "KeyT"], () => router.push(newEntityTypeRoute));

  return (
    <Box>
      <IconButton
        sx={{
          mr: {
            xs: 1,
            md: 1.5,
          },
          width: "32px",
          height: "32px",
          borderRadius: "100%",
          color: open ? theme.palette.common.white : theme.palette.gray[40],
          backgroundColor: open
            ? theme.palette.blue["70"]
            : theme.palette.gray[20],

          "&:hover": {
            backgroundColor: theme.palette.blue["70"],
            color: theme.palette.common.white,
          },
        }}
        ref={buttonRef}
        onClick={() => setOpen(!open)}
      >
        <FontAwesomeIcon icon={faPlus} />
      </IconButton>

      <CreatePageModal
        show={createPageOpen}
        close={closeCreatePage}
        accountId={accountId}
      />

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
        <Box>
          <ListItemButton
            sx={{
              mx: 0.5,
              mt: 0.5,
              borderRadius: 1,
              lineHeight: 1,
              display: "flex",
              justifyContent: "space-between",
            }}
            onClick={showCreatePage}
          >
            <Typography variant="smallTextLabels">Create page</Typography>
            {!isMobile && <Typography variant="microText">Opt + P</Typography>}
          </ListItemButton>
          <ListItemButton
            sx={{
              mx: 0.5,
              borderRadius: 1,
              lineHeight: 1,
              display: "flex",
              justifyContent: "space-between",
            }}
            onClick={() => setOpen(false)}
          >
            <Typography variant="smallTextLabels">Create entity</Typography>
            {!isMobile && <Typography variant="microText">Opt + E</Typography>}
          </ListItemButton>
          <Link
            noLinkStyle
            href={newEntityTypeRoute}
            onClick={() => setOpen(false)}
          >
            <ListItemButton
              sx={{
                mx: 0.5,
                mb: 0.5,
                borderRadius: 1,
                lineHeight: 1,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="smallTextLabels">Create type</Typography>
              {!isMobile && (
                <Typography variant="microText">Opt + T</Typography>
              )}
            </ListItemButton>
          </Link>
        </Box>
      </Popover>
    </Box>
  );
};
