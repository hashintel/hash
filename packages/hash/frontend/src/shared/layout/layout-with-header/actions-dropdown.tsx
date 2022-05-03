import { useState, useCallback, VFC } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  ListItemSecondaryAction,
  listItemSecondaryActionClasses,
  ListItemText,
  Menu,
  MenuItem,
  useTheme,
} from "@mui/material";
import { useKeys } from "rooks";
import { useRouter } from "next/router";

import {
  usePopupState,
  bindMenu,
  bindTrigger,
} from "material-ui-popup-state/hooks";
import { FontAwesomeIcon } from "../../icons";
import { Link } from "../../ui";
import { HeaderIconButton } from "./shared/header-icon-button";
import { useCreatePage } from "../../../components/hooks/useCreatePage";
import { useRouteAccountInfo } from "../../routing";

export const ActionsDropdownInner: VFC<{
  accountId: string;
}> = ({ accountId }) => {
  const router = useRouter();
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const { createUntitledPage } = useCreatePage(accountId);
  const popupState = usePopupState({
    variant: "popover",
    popupId: "actions-dropdown-menu",
  });

  // @todo handle loading/error states properly
  const addPage = useCallback(async () => {
    if (loading) {
      return;
    }

    setLoading(true);
    try {
      await createUntitledPage();
    } catch (err) {
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.error("Could not create page: ", err);
    } finally {
      popupState.close();
      setLoading(false);
    }
  }, [createUntitledPage, loading, popupState]);

  const newEntityTypeRoute = `/${accountId}/types/new`;

  useKeys(["AltLeft", "KeyP"], addPage);
  useKeys(["AltLeft", "KeyT"], () => router.push(newEntityTypeRoute));

  return (
    <Box>
      <HeaderIconButton
        size="medium"
        rounded
        sx={({ palette }) => ({
          mr: {
            xs: 1,
            md: 1.5,
          },
          color: popupState.isOpen ? palette.common.white : palette.gray[40],
          backgroundColor: popupState.isOpen
            ? palette.blue["70"]
            : palette.gray[20],
        })}
        {...bindTrigger(popupState)}
      >
        <FontAwesomeIcon icon={faPlus} />
      </HeaderIconButton>

      <Menu
        {...bindMenu(popupState)}
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

            [`.${listItemSecondaryActionClasses.root}`]: {
              display: { xs: "none", md: "block" },
            },
          },
        }}
      >
        <MenuItem
          onClick={() => {
            void addPage();
            popupState.close();
          }}
        >
          <ListItemText primary="Create page" />
          <ListItemSecondaryAction>Opt + P</ListItemSecondaryAction>
        </MenuItem>
        <MenuItem onClick={popupState.close}>
          <ListItemText primary="Create entity" />
          <ListItemSecondaryAction>Opt + E</ListItemSecondaryAction>
        </MenuItem>
        <Link noLinkStyle href={newEntityTypeRoute}>
          <MenuItem onClick={popupState.close}>
            <ListItemText primary="Create Type" />
            <ListItemSecondaryAction>Opt + T</ListItemSecondaryAction>
          </MenuItem>
        </Link>
      </Menu>
    </Box>
  );
};

export const ActionsDropdown: VFC = () => {
  const { accountId } = useRouteAccountInfo({ allowUndefined: true }) ?? {};

  // Don’t render actions if account cannot be derived from URL
  if (!accountId) {
    return null;
  }

  return <ActionsDropdownInner accountId={accountId} />;
};
