import { VFC, useMemo, useState } from "react";
import {
  Divider,
  ListItemIcon,
  listItemIconClasses,
  ListItemText,
  listItemTextClasses,
  Menu,
  MenuItem,
} from "@mui/material";
import { bindMenu, PopupState } from "material-ui-popup-state/hooks";
import {
  faArrowRight,
  faBookmark,
  faCopy,
  faEyeSlash,
  faLink,
  faPencil,
} from "@fortawesome/free-solid-svg-icons";
import { faFileAlt, faTrashCan } from "@fortawesome/free-regular-svg-icons";
import { useRouteAccountInfo } from "../../../../shared/routing";
import { FontAwesomeIcon } from "../../../../shared/icons";
import { useCreatePage } from "../../../hooks/useCreatePage";

type PageMenuProps = {
  popupState: PopupState;
  entityId: string;
};

export const PageMenu: VFC<PageMenuProps> = ({ popupState, entityId }) => {
  const [copied, setCopied] = useState(false);
  const { accountId } = useRouteAccountInfo();
  const { createSubPage } = useCreatePage(accountId);

  const menuItems = useMemo(
    () => [
      {
        title: "Add to bookmarks",
        icon: faBookmark,
      },
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
        title: "Duplicate Page",
        icon: faCopy,
      },
      {
        title: "Rename Page",
        icon: faPencil,
      },
      {
        title: "Move Page",
        icon: faArrowRight,
      },
      {
        title: "Make private",
        icon: faEyeSlash,
      },
      {
        type: "divider",
      },
      {
        title: "Delete",
        icon: faTrashCan,
      },
    ],
    [copied, popupState, createSubPage, accountId, entityId],
  );
  return (
    <Menu {...bindMenu(popupState)}>
      {menuItems.map(({ title, icon, type, onClick }, index) => {
        if (type === "divider") {
          // eslint-disable-next-line react/no-array-index-key
          return <Divider key={index} />;
        }
        return (
          <MenuItem
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            sx={{
              // @todo-mui MenuItem should have a faded type, which when applied,
              // adds this styling
              ...(index === menuItems.length - 1 && {
                [`& .${listItemTextClasses.primary}`]: {
                  color: ({ palette }) => palette.gray[60],
                },
                [`& .${listItemIconClasses.root}`]: {
                  color: ({ palette }) => palette.gray[40],
                },
              }),
            }}
            onClick={onClick ?? popupState.close}
          >
            <ListItemIcon>
              <FontAwesomeIcon icon={icon!} />
            </ListItemIcon>
            <ListItemText primary={title} />
          </MenuItem>
        );
      })}
    </Menu>
  );
};
