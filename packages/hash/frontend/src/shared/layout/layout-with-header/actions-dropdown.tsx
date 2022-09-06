import { useState, useCallback, FunctionComponent, useMemo } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  ListItemSecondaryAction,
  listItemSecondaryActionClasses,
  ListItemText,
  useTheme,
} from "@mui/material";
import { useKeys } from "rooks";
import { useRouter } from "next/router";

import {
  usePopupState,
  bindMenu,
  bindTrigger,
} from "material-ui-popup-state/hooks";
import { Menu, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { MenuItem } from "../../ui";
import { HeaderIconButton } from "./shared/header-icon-button";
import { useAccountPages } from "../../../components/hooks/useAccountPages";
import { useCreatePage } from "../../../components/hooks/useCreatePage";
import { useRouteAccountInfo } from "../../routing";

export const ActionsDropdownInner: FunctionComponent<{
  accountId: string;
}> = ({ accountId }) => {
  const router = useRouter();
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const { data } = useAccountPages(accountId);
  const [createUntitledPage] = useCreatePage(accountId);
  const popupState = usePopupState({
    variant: "popover",
    popupId: "actions-dropdown-menu",
  });

  const lastRootPageIndex = useMemo(() => {
    const rootPages = data
      .filter(({ parentPageEntityId }) => parentPageEntityId === null)
      .map(({ index }) => index)
      .sort();

    return rootPages[rootPages.length - 1] ?? null;
  }, [data]);

  // @todo handle loading/error states properly
  const addPage = useCallback(async () => {
    if (loading) {
      return;
    }

    setLoading(true);
    try {
      await createUntitledPage(lastRootPageIndex);
    } catch (err) {
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.error("Could not create page: ", err);
    } finally {
      popupState.close();
      setLoading(false);
    }
  }, [createUntitledPage, loading, popupState, lastRootPageIndex]);

  const newEntityTypeRoute = `/${accountId}/types/new`;

  useKeys(["AltLeft", "KeyP"], addPage);
  useKeys(["AltLeft", "KeyT"], () => router.push(newEntityTypeRoute));

  return (
    <Box>
      <HeaderIconButton
        size="medium"
        rounded
        sx={({ palette }) => ({
          mr: 1,
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
        {/*  
          Commented out menu items whose functionality have not been implemented yet
          @todo uncomment when functionality has been implemented 
        */}
        {/* <MenuItem onClick={popupState.close}>
          <ListItemText primary="Create entity" />
          <ListItemSecondaryAction>Opt + E</ListItemSecondaryAction>
        </MenuItem> */}
        <MenuItem href={newEntityTypeRoute} onClick={popupState.close}>
          <ListItemText primary="Create Type" />
          <ListItemSecondaryAction>Opt + T</ListItemSecondaryAction>
        </MenuItem>
      </Menu>
    </Box>
  );
};

export const ActionsDropdown: FunctionComponent = () => {
  const { accountId } = useRouteAccountInfo({ allowUndefined: true }) ?? {};

  // Don’t render actions if account cannot be derived from URL
  if (!accountId) {
    return null;
  }

  return <ActionsDropdownInner accountId={accountId} />;
};
