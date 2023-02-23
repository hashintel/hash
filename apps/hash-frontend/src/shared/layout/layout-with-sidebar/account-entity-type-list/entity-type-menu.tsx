import { BaseUri, VersionedUri } from "@blockprotocol/type-system";
import {
  faAdd,
  faLink,
  IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { ListItemIcon, ListItemText, Menu } from "@mui/material";
import { bindMenu, PopupState } from "material-ui-popup-state/hooks";
import pluralize from "pluralize";
import { FunctionComponent, useState } from "react";

import { useFrozenValue } from "../../../frozen";
import { MenuItem } from "../../../ui";

type EntityTypeMenuProps = {
  entityTypeId: VersionedUri;
  popupState: PopupState;
  title: string;
  uri: BaseUri;
};

const EntityTypeMenuItem = ({
  title,
  icon,
  href,
  faded,
  onClick,
  popupState,
}: {
  title: string;
  icon: IconDefinition;
  faded?: boolean;
  popupState: PopupState;
} & (
  | { href: string; onClick?: null }
  | { href?: null; onClick: () => void }
)) => {
  return (
    <MenuItem
      {...(href ? { href } : {})}
      faded={faded}
      onClick={onClick ?? popupState.close}
    >
      <ListItemIcon>
        <FontAwesomeIcon icon={icon} />
      </ListItemIcon>
      <ListItemText primary={title} />
    </MenuItem>
  );
};

// @todo-mui get free icons that matches the design closely
export const EntityTypeMenu: FunctionComponent<EntityTypeMenuProps> = ({
  entityTypeId,
  popupState,
  title,
  uri,
}) => {
  const [copied, setCopied] = useState(false);
  const copiedFrozen = useFrozenValue(copied, !popupState.isOpen);

  return (
    <Menu {...bindMenu(popupState)}>
      <EntityTypeMenuItem
        title={`Create new ${pluralize.singular(title)}`}
        icon={faAdd}
        href={`/new/entity?entity-type-id=${entityTypeId}`}
        popupState={popupState}
      />
      <EntityTypeMenuItem
        title={copiedFrozen ? "Copied!" : `Copy link to ${title}`}
        icon={faLink}
        popupState={popupState}
        onClick={() => {
          void navigator.clipboard.writeText(uri);
          setCopied(true);
          setTimeout(() => {
            setCopied(false);
            popupState.close();
          }, 2000);
        }}
      />
    </Menu>
  );
};
