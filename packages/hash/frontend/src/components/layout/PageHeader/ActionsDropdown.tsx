import { useCallback, useState, useRef } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  ListItemButton,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useKeys } from "rooks";
import { useRouter } from "next/router";

import { FontAwesomeIcon } from "../../icons";
import { Popover } from "../../Popover";
import { IconButton } from "../../IconButton";
import { Link } from "../../Link";
import { CreatePageModal } from "../../Modals/CreatePageModal";
import { useModal } from "react-modal-hook";

export const ActionsDropdown: React.FC<{
  accountId: string;
}> = ({ accountId }) => {
  const router = useRouter();

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const buttonRef = useRef(null);

  const [open, setOpen] = useState(false);

  const id = open ? "actions-popover" : undefined;

  const [showCreatePageModal, hideCreatePageModal] = useModal(() => (
    <CreatePageModal accountId={accountId} show onClose={hideCreatePageModal} />
  ));

  const newEntityTypeRoute = `/${accountId}/types/new`;

  useKeys(["AltLeft", "KeyP"], showCreatePageModal);
  useKeys(["AltLeft", "KeyT"], () => router.push(newEntityTypeRoute));

  return (
    <Box>
      <IconButton
        size="medium"
        rounded
        sx={{
          mr: {
            xs: 1,
            md: 1.5,
          },
          color: open ? theme.palette.common.white : theme.palette.gray[40],
          backgroundColor: open
            ? theme.palette.blue["70"]
            : theme.palette.gray[20],
        }}
        ref={buttonRef}
        onClick={() => setOpen(!open)}
      >
        <FontAwesomeIcon icon={faPlus} />
      </IconButton>

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
            onClick={showCreatePageModal}
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
