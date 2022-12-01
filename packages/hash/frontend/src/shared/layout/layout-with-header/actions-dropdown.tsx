import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import {
  Box,
  listItemSecondaryActionClasses,
  ListItemText,
  Menu,
  useTheme,
} from "@mui/material";

import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import {
  FunctionComponent,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useAccountPages } from "../../../components/hooks/useAccountPages";
import { useCreatePage } from "../../../components/hooks/useCreatePage";
import { WorkspaceContext } from "../../../pages/shared/workspace-context";
import { MenuItem } from "../../ui";
import { HeaderIconButton } from "./shared/header-icon-button";

export const ActionsDropdownInner: FunctionComponent<{
  accountId: string;
}> = ({ accountId }) => {
  const theme = useTheme();
  const { activeWorkspace } = useContext(WorkspaceContext);
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
          <ListItemText primary="Create Page" />
        </MenuItem>
        {/*  
          Commented out menu items whose functionality have not been implemented yet
          @todo uncomment when functionality has been implemented 
        */}
        {/* <MenuItem onClick={popupState.close}>
          <ListItemText primary="Create entity" />
        </MenuItem> */}
        {activeWorkspace ? (
          <>
            <MenuItem
              href={`/@${activeWorkspace.shortname}/entities/new`}
              onClick={popupState.close}
            >
              <ListItemText primary="Create Entity" />
            </MenuItem>
            <MenuItem
              href={`/@${activeWorkspace.shortname}/types/new/entity-type`}
              onClick={popupState.close}
            >
              <ListItemText primary="Create Entity Type" />
            </MenuItem>
          </>
        ) : null}
      </Menu>
    </Box>
  );
};

export const ActionsDropdown: FunctionComponent = () => {
  const { activeWorkspaceAccountId } = useContext(WorkspaceContext);

  return activeWorkspaceAccountId ? (
    <ActionsDropdownInner accountId={activeWorkspaceAccountId} />
  ) : null;
};
