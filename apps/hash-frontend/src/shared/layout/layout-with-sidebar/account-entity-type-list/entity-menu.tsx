import { VersionedUrl } from "@blockprotocol/type-system";
import { faAdd, faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Menu } from "@mui/material";
import { bindMenu, PopupState } from "material-ui-popup-state/hooks";
import pluralize from "pluralize";
import { FunctionComponent } from "react";

import { generateLinkParameters } from "../../../generate-link-parameters";
import { EntityTypeMenuItem } from "./entity-type-menu-item";

type EntityTypeMenuProps = {
  entityTypeId: VersionedUrl;
  popupState: PopupState;
  title: string;
};

export const EntityMenu: FunctionComponent<EntityTypeMenuProps> = ({
  entityTypeId,
  popupState,
  title,
}) => {
  return (
    <Menu {...bindMenu(popupState)}>
      <EntityTypeMenuItem
        title={`Create new ${pluralize.singular(title)}`}
        icon={faAdd}
        href={`/new/entity?entity-type-id=${entityTypeId}`}
        popupState={popupState}
      />
      <EntityTypeMenuItem
        title={`View all ${pluralize(title)}`}
        icon={faAsterisk}
        popupState={popupState}
        href={`/entities?entityTypeIdOrBaseUrl=${extractBaseUrl(entityTypeId)}`}
      />
      <EntityTypeMenuItem
        title="View Type"
        icon={faAsterisk}
        href={generateLinkParameters(entityTypeId).href}
        popupState={popupState}
      />
    </Menu>
  );
};
