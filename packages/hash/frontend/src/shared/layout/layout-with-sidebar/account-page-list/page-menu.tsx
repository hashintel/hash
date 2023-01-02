import { faFileAlt } from "@fortawesome/free-regular-svg-icons";
import { faArchive, faLink } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { EntityId } from "@hashintel/hash-shared/types";
import {
  ListItemIcon,
  ListItemText,
  Menu,
  PopoverPosition,
} from "@mui/material";
import { bindMenu, PopupState } from "material-ui-popup-state/hooks";
import { FunctionComponent, useMemo, useState } from "react";

import { MenuItem } from "../../../ui";

type PageMenuProps = {
  popupState: PopupState;
  entityId: EntityId;
  createSubPage: () => Promise<void>;
  archivePage: (value: boolean, pageEntityId: EntityId) => Promise<void>;
  onClose: () => void;
  anchorPosition?: PopoverPosition;
  pagePath: string;
};

export const PageMenu: FunctionComponent<PageMenuProps> = ({
  popupState,
  entityId,
  createSubPage,
  archivePage,
  anchorPosition,
  onClose,
  pagePath,
}) => {
  const [copied, setCopied] = useState(false);

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
            await createSubPage();
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
            `${window.location.origin}${pagePath}`,
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
            await archivePage(true, entityId);
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
    [copied, createSubPage, popupState, pagePath, archivePage, entityId],
  );

  const bindMenuProps = bindMenu(popupState);

  return (
    <Menu
      {...bindMenuProps}
      onClose={() => {
        // run custom handler before handler of `bindMenu`
        onClose();
        return bindMenuProps.onClose();
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      {...(anchorPosition && {
        anchorReference: "anchorPosition",
        anchorPosition,
      })}
    >
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
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
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
