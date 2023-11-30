import { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import {
  faAdd,
  faLink,
  IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { ArrowUpRightIcon, FontAwesomeIcon } from "@hashintel/design-system";
import { pluralize } from "@local/hash-isomorphic-utils/pluralize";
import { ListItemIcon, ListItemText, Menu } from "@mui/material";
import { bindMenu, PopupState } from "material-ui-popup-state/hooks";
import { FunctionComponent, ReactElement, useState } from "react";

import { useFrozenValue } from "../../../frozen";
import { MenuItem } from "../../../ui";

type EntityTypeMenuProps = {
  entityTypeId: VersionedUrl;
  popupState: PopupState;
  title: string;
  url: BaseUrl;
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
  icon: IconDefinition | ReactElement;
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
        {"icon" in icon ? <FontAwesomeIcon icon={icon} /> : icon}
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
  url,
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
          void navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => {
            setCopied(false);
            popupState.close();
          }, 2000);
        }}
      />
      <EntityTypeMenuItem
        title="Extend this type"
        icon={<ArrowUpRightIcon sx={{ fontSize: 16 }} />}
        href={`/new/types/entity-type?extends=${entityTypeId}`}
        popupState={popupState}
      />
    </Menu>
  );
};
