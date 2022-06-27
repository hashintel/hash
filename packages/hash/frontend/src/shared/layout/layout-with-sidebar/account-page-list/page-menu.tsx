import { VFC, useMemo, useState } from "react";
import { ListItemIcon, ListItemText, Menu } from "@mui/material";
import { bindMenu, PopupState } from "material-ui-popup-state/hooks";
import { faArchive, faLink } from "@fortawesome/free-solid-svg-icons";
import { faFileAlt } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { useArchivePage } from "../../../../components/hooks/useArchivePage";
import { useRouteAccountInfo } from "../../../routing";
import { useCreatePage } from "../../../../components/hooks/useCreatePage";
import { MenuItem } from "../../../ui";

type PageMenuProps = {
  popupState: PopupState;
  entityId: string;
};

export const PageMenu: VFC<PageMenuProps> = ({ popupState, entityId }) => {
  const [copied, setCopied] = useState(false);
  const { accountId } = useRouteAccountInfo();
  const { createSubPage } = useCreatePage(accountId);
  const archivePage = useArchivePage(accountId);

  // Commented out menu items whose functionality have not been
  // implemented yet
  // @todo uncomment when functionality has been implemented
  const menuItems = useMemo(
    () => [
      // {
      //   title: "Add to bookmarks",
      //   icon: faBookmark,
      // },
      {
        title: "Add subpage",
        icon: faFileAlt,
        onClick: async () => {
          try {
            // @todo handle loading/error states properly
            await createSubPage(entityId);
          } catch (err) {
            // eslint-disable-next-line no-console -- TODO: consider using logger
            console.log("err ==> ", err);
          } finally {
            popupState.close();
          }
        },
      },
      {
        title: copied ? "Copied!" : "Copy link to page",
        icon: faLink,
        onClick: () => {
          void navigator.clipboard.writeText(
            `${window.location.origin}/${accountId}/${entityId}`,
          );
          setCopied(true);
          setTimeout(() => {
            setCopied(false);
            popupState.close();
          }, 2000);
        },
      },
      {
        title: "Archive page",
        icon: faArchive,
        onClick: async () => {
          try {
            // @todo handle loading/error states properly
            await archivePage(entityId);
          } catch (err) {
            // eslint-disable-next-line no-console -- TODO: consider using logger
            console.log("Error archiving page: ", err);
          } finally {
            popupState.close();
          }
        },
      },
      // {
      //   title: "Duplicate Page",
      //   icon: faCopy,
      // },
      // {
      //   title: "Rename Page",
      //   icon: faPencil,
      // },
      // {
      //   title: "Move Page",
      //   icon: faArrowRight,
      // },
      // {
      //   title: "Make private",
      //   icon: faEyeSlash,
      // },
      // {
      //   type: "divider",
      // },
      // {
      //   title: "Delete",
      //   icon: faTrashCan,
      //   faded: true
      // },
    ],
    [copied, popupState, createSubPage, accountId, entityId, archivePage],
  );
  return (
    <Menu {...bindMenu(popupState)}>
      {menuItems.map(({ title, icon, onClick }, index) => {
        // if (type === "divider") {
        //   // eslint-disable-next-line react/no-array-index-key
        //   return <Divider key={index} />;
        // }
        return (
          <MenuItem
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            // faded={faded}
            onClick={onClick ?? popupState.close}
          >
            <ListItemIcon>
              <FontAwesomeIcon icon={icon} />
            </ListItemIcon>
            <ListItemText primary={title} />
          </MenuItem>
        );
      })}
    </Menu>
  );
};
